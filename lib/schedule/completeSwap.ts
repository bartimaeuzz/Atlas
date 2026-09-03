/** Shared swap-completion logic (Schedule Planner Phase E, 2026-08-16).
 * Deliberately NOT in lib/actions/swap.ts: that file has "use server" at
 * the top, which makes every exported async function a client-callable
 * Server Action -- exporting this here (with no session/eligibility
 * checks of its own) would let anyone call it directly and reassign any
 * shift. Keeping it in a plain module means it's only reachable through
 * the actions, which do the actual authorization first, while still
 * being a normal importable function for direct verification. */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, shifts, shiftRosterEntries } from "@/db/schema";

/** The writes that move a shift from one person to the other, prepared
 * but NOT executed, so the caller can db.batch() them together with its
 * own status update.
 *
 * Two reasons this returns queries instead of running them (2026-09-03):
 *
 * 1. ATOMICITY. Moving the plan and moving the roster row used to be two
 *    sequential awaits. If the second failed, the plan said B while the
 *    roster still said A -- and the roster is what the wage and tip-pool
 *    calculation reads (lib/shift/loadRosterForCalc.ts), so that
 *    half-state pays the wrong person.
 * 2. VALIDATE BEFORE THE FIRST WRITE. acceptSwapRequest used to set the
 *    status to "completed" and only then call this, which could still
 *    throw on a finalized shift -- leaving a swap marked complete whose
 *    assignment never moved. Every refusal now happens here, before the
 *    caller writes anything. */
export interface PreparedSwapMove {
  planQuery: ReturnType<typeof buildPlanUpdate>;
  rosterQuery: ReturnType<typeof buildRosterUpdate> | null;
}

function buildPlanUpdate(assignmentId: number, toEmployeeId: number) {
  return db.update(plannedShiftAssignments).set({ employeeId: toEmployeeId }).where(eq(plannedShiftAssignments.id, assignmentId));
}

function buildRosterUpdate(shiftId: number, fromEmployeeId: number, toEmployeeId: number, positionId: number) {
  return db
    .update(shiftRosterEntries)
    .set({ employeeId: toEmployeeId })
    .where(
      and(
        eq(shiftRosterEntries.shiftId, shiftId),
        eq(shiftRosterEntries.employeeId, fromEmployeeId),
        eq(shiftRosterEntries.positionId, positionId)
      )
    );
}

/** Reassigns the plan (and the real shiftRosterEntries row, if a real
 * shift already exists for that date/period) from `fromEmployeeId` to
 * `toEmployeeId`. Refuses if a real shift exists and has been finalized
 * -- payroll for that shift is locked, same as every other "finalize
 * closes the door" rule in this app (Card statement periods, Closing
 * Report). */
async function prepareMove(
  request: typeof swapRequests.$inferSelect,
  fromEmployeeId: number,
  toEmployeeId: number
): Promise<PreparedSwapMove> {
  // Nullable since 2026-08-30 (detached resolved swaps) -- a swap being
  // moved is by definition still attached, so refuse on null rather
  // than silently matching nothing.
  if (request.assignmentId == null) throw new Error("The underlying shift no longer exists");
  const [assignment] = await db
    .select()
    .from(plannedShiftAssignments)
    .where(eq(plannedShiftAssignments.id, request.assignmentId));
  if (!assignment) throw new Error("The underlying shift no longer exists");

  // The person handing the shift over must still HOLD it (2026-09-03).
  // Without this, an offer that was overtaken by events silently steals
  // the shift from whoever holds it now, because the update sets the new
  // employee regardless of the old one. Two ways that happens: a manager
  // puts a completed swap back while the person who took it has already
  // re-offered it, and a manager reassigns the slot by hand under a live
  // offer. Both leave a stale open request pointing at a shift its
  // requester no longer owns.
  if (assignment.employeeId !== fromEmployeeId) {
    throw new Error("That shift isn't theirs any more — someone else has it now, so this swap can't go through");
  }

  const [realShift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.date, assignment.date), eq(shifts.period, assignment.period)));

  if (realShift && realShift.status === "finalized") {
    throw new Error(
      "That shift has already been finalized and payroll for it is locked — this swap can't be changed automatically. Ask a manager to adjust it by hand instead."
    );
  }

  return {
    planQuery: buildPlanUpdate(assignment.id, toEmployeeId),
    rosterQuery: realShift ? buildRosterUpdate(realShift.id, fromEmployeeId, toEmployeeId, assignment.positionId) : null,
  };
}

/** Requester -> accepter. Used when someone takes an offered shift. */
export async function prepareSwapCompletion(request: typeof swapRequests.$inferSelect): Promise<PreparedSwapMove> {
  if (!request.acceptingEmployeeId) throw new Error("No one has accepted this request yet");
  return prepareMove(request, request.requestingEmployeeId, request.acceptingEmployeeId);
}

/** Accepter -> requester. The manager's after-the-fact veto ("put it
 * back"), which replaced the old approve/decline gate on 2026-09-03. The
 * shift returns to whoever originally offered it; if they still can't
 * work it, they offer it again. */
export async function prepareSwapReversal(request: typeof swapRequests.$inferSelect): Promise<PreparedSwapMove> {
  if (!request.acceptingEmployeeId) throw new Error("Nobody has taken this shift, so there is nothing to put back");
  return prepareMove(request, request.acceptingEmployeeId, request.requestingEmployeeId);
}
