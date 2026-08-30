/** Shared swap-completion logic (Schedule Planner Phase E, 2026-08-16).
 * Deliberately NOT in lib/actions/swap.ts: that file has "use server" at
 * the top, which makes every exported async function a client-callable
 * Server Action -- exporting this here (with no session/eligibility
 * checks of its own) would let anyone call it directly and reassign any
 * shift. Keeping it in a plain module means it's only reachable through
 * acceptSwapRequest/approveSwapRequest, which do the actual
 * authorization first, while still being a normal importable function
 * for direct verification. */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, shifts, shiftRosterEntries } from "@/db/schema";

/** Reassigns the plan (and the real shiftRosterEntries row, if a real
 * shift already exists for that date/period) from the requester to the
 * accepter. Shared by the immediate-accept path (>3 days out) and the
 * manager-approval path. Throws (refuses to complete) if a real shift
 * already exists and has been finalized -- payroll for that shift is
 * locked, same as every other "finalize closes the door" rule in this
 * app (Card statement periods, Closing Report). */
export async function completeSwap(request: typeof swapRequests.$inferSelect): Promise<void> {
  // Nullable since 2026-08-30 (detached resolved swaps) -- a swap being
  // completed is by definition still attached, so refuse on null rather
  // than silently matching nothing.
  if (request.assignmentId == null) throw new Error("The underlying shift no longer exists");
  const [assignment] = await db
    .select()
    .from(plannedShiftAssignments)
    .where(eq(plannedShiftAssignments.id, request.assignmentId));
  if (!assignment) throw new Error("The underlying shift no longer exists");
  if (!request.acceptingEmployeeId) throw new Error("No one has accepted this request yet");

  const [realShift] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.date, assignment.date), eq(shifts.period, assignment.period)));

  if (realShift && realShift.status === "finalized") {
    throw new Error(
      "That shift has already been finalized and payroll for it is locked -- this swap can't complete automatically. Ask a manager to adjust it by hand instead."
    );
  }

  await db
    .update(plannedShiftAssignments)
    .set({ employeeId: request.acceptingEmployeeId })
    .where(eq(plannedShiftAssignments.id, assignment.id));

  if (realShift) {
    await db
      .update(shiftRosterEntries)
      .set({ employeeId: request.acceptingEmployeeId })
      .where(
        and(
          eq(shiftRosterEntries.shiftId, realShift.id),
          eq(shiftRosterEntries.employeeId, request.requestingEmployeeId),
          eq(shiftRosterEntries.positionId, assignment.positionId)
        )
      );
  }
}
