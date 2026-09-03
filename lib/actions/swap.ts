"use server";

/** Shift swap requests (2026-08-16, Schedule Planner Phase E). See
 * db/schema.ts's swapRequests comment for the full state machine and
 * design reasoning -- confirmed with Oliver across two rounds of
 * AskUserQuestion before any of this was written. */

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { businessTodayIso } from "@/lib/formatDateTime";
import { revalidatePath } from "next/cache";
import { eq, and, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, scheduleWeeks, employeePositions, employees } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { prepareSwapCompletion, prepareSwapReversal } from "@/lib/schedule/completeSwap";
import { loadOnLeaveLookup } from "@/lib/schedule/onLeave";

// respondedAt/decidedAt are written via SQLite's own current_timestamp
// (through `sql`), NOT a JS-side `new Date().toISOString()` -- the same
// lesson from the leave-requests red-pill badge (see
// lib/actions/notifications.ts's comment): loadUnseenSwapCount compares
// these columns as plain strings against notificationSeen.lastSeenAt,
// which is also written via current_timestamp. Two different formats
// ("2026-08-16 12:00:00" vs "2026-08-16T12:00:00.000Z") don't compare
// correctly against each other with `>` -- caught by verify_swap.ts
// before this shipped (it broke the OTHER direction from the leave bug:
// the badge would never have cleared at all).

export interface SwapRequestActionState {
  error: string | null;
}

function revalidateSwapPaths() {
  revalidatePath("/schedule/plan");
  revalidatePath("/schedule/swaps");
  revalidatePath("/schedule");
  revalidatePath("/me/schedule");
}

/** Any signed-in employee offers up one of their own upcoming,
 * published-week shifts for swap. Re-validates ownership + eligibility
 * server-side rather than trusting the picklist the UI built from
 * loadMySwappableAssignments -- that list can go stale between page
 * load and submit. useActionState shape (prevState/formData -> {error}),
 * matching submitLeaveRequest's pattern rather than throwing, so the
 * form can show an inline error instead of an uncaught rejection. */
export async function createSwapRequest(
  _prevState: SwapRequestActionState,
  formData: FormData
): Promise<SwapRequestActionState> {
  const assignmentId = Number(formData.get("assignmentId"));
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");
    if (!assignmentId) throw new Error("Pick a shift to offer");

    const [assignment] = await db
      .select()
      .from(plannedShiftAssignments)
      .where(eq(plannedShiftAssignments.id, assignmentId));
    if (!assignment) throw new Error("That shift no longer exists");
    if (assignment.employeeId !== session.id) {
      throw new Error("You can only offer your own shifts");
    }

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, assignment.weekId));
    if (!week || week.status !== "published") {
      throw new Error("Only published shifts can be offered for swap");
    }
    const today = businessTodayIso();
    if (assignment.date < today) {
      throw new Error("That shift has already passed");
    }

    const [liveRequest] = await db
      .select()
      .from(swapRequests)
      .where(
        and(eq(swapRequests.assignmentId, assignmentId), eq(swapRequests.status, "open"))
      );
    if (liveRequest) throw new Error("This shift already has an active swap request");

    await db.insert(swapRequests).values({ assignmentId, requestingEmployeeId: session.id, note });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidateSwapPaths();
  return { error: null };
}

/** Requester withdraws their own request while it's still open --
 * confirmed self-service, same spirit as cancelling a leave request. */
export async function cancelSwapRequest(requestId: number): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) return;
    if (request.requestingEmployeeId !== session.id) throw new Error("You can only cancel your own request");
    if (request.status !== "open") throw new Error("Only an unclaimed request can be cancelled");

    await db.update(swapRequests).set({ status: "cancelled" }).where(eq(swapRequests.id, requestId));
    revalidateSwapPaths();
});
}

/** A MANAGER cancels someone else's swap request (2026-08-30, Oliver's
 * call, made when the danger-zone delete gate exposed the gap: an OPEN
 * request could only ever be cancelled by its own requester, so a
 * blocked week-delete sent managers to a page with nothing they could
 * act on). Allowed on open only -- the one
 * state where the swap is still a live promise -- once someone has taken
 * it, the manager's control is putBackSwap instead. A REASON IS REQUIRED:
 * the requester sees it verbatim on their own My Schedule panel along
 * with who cancelled ("notify staff that your request was cancel why
 * and by whom"), so this field is the notification -- Atlas has no
 * other channel to the staff member. Works on past-dated requests too;
 * a stale open swap on a shift that already happened is exactly the
 * kind this exists to clear. */
export async function managerCancelSwapRequest(requestId: number, reason: string): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("SCHEDULE_MANAGE");

    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("Add a short reason — the person who posted this will see it");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");
    if (request.status !== "open") {
      throw new Error("That request has already been settled");
    }

    await db
      .update(swapRequests)
      .set({
        status: "cancelled",
        cancelReason: trimmedReason,
        decidedAt: sql`(current_timestamp)`,
        decidedByEmployeeId: session.id,
      })
      .where(eq(swapRequests.id, requestId));

    revalidateSwapPaths();
});
}

/** A coworker takes an open swap request. Re-checks every eligibility
 * rule server-side: must actively hold the position, can't take your
 * own request, can't already be assigned elsewhere at that exact
 * date+period, can't be on leave that day.
 *
 * Taking COMPLETES the swap immediately, at any notice (2026-09-03). The
 * old rule sent shifts due within three days to pending_manager_approval
 * instead; that gate was deleted because it fired precisely when the
 * manager had least time to click, and a swap left unclicked meant the
 * schedule asserted the wrong person had worked. The manager's control is
 * now putBackSwap, after the fact, where it costs nothing when unused. */
export async function acceptSwapRequest(requestId: number): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");
    if (request.status !== "open") throw new Error("That request is no longer open");
    if (request.requestingEmployeeId === session.id) throw new Error("You can't accept your own request");

    // assignmentId is nullable since 2026-08-30 (a resolved swap can be
    // detached from a deleted schedule) -- an OPEN request always still
    // has one, so a null here means the data is in an impossible state.
    if (request.assignmentId == null) throw new Error("The underlying shift no longer exists");
    const [assignment] = await db
      .select()
      .from(plannedShiftAssignments)
      .where(eq(plannedShiftAssignments.id, request.assignmentId));
    if (!assignment) throw new Error("The underlying shift no longer exists");

    const [holdsPosition] = await db
      .select()
      .from(employeePositions)
      .where(
        and(
          eq(employeePositions.employeeId, session.id),
          eq(employeePositions.positionId, assignment.positionId),
          eq(employeePositions.isActive, true)
        )
      );
    if (!holdsPosition) throw new Error("You don't hold the position this shift needs");

    const [conflict] = await db
      .select()
      .from(plannedShiftAssignments)
      .where(
        and(
          eq(plannedShiftAssignments.employeeId, session.id),
          eq(plannedShiftAssignments.date, assignment.date),
          eq(plannedShiftAssignments.period, assignment.period)
        )
      );
    if (conflict) throw new Error("You're already scheduled that day/period");

    const onLeaveOn = await loadOnLeaveLookup(assignment.date, assignment.date);
    if (onLeaveOn(session.id, assignment.date)) {
      throw new Error("You have leave logged over that date");
    }

    // Prepared, not executed: prepareSwapCompletion does the last refusal
    // (a finalized shift's payroll is locked) BEFORE anything is written,
    // and hands back the moves so they commit in one batch with the status.
    // Previously the status was set to "completed" first and the move could
    // still throw afterwards, leaving a completed swap whose shift never
    // moved -- and the plan and the roster row could diverge from each
    // other, which is what the wage and tip-pool calculation reads.
    const move = await prepareSwapCompletion({ ...request, acceptingEmployeeId: session.id });
    const statusQuery = db
      .update(swapRequests)
      .set({
        acceptingEmployeeId: session.id,
        status: "completed",
        respondedAt: sql`(current_timestamp)`,
      })
      .where(eq(swapRequests.id, requestId));

    if (move.rosterQuery) await db.batch([move.planQuery, move.rosterQuery, statusQuery]);
    else await db.batch([move.planQuery, statusQuery]);

    revalidateSwapPaths();
});
}

/** The manager's control over swaps, after the fact (2026-09-03) --
 * this replaced approveSwapRequest/declineSwapRequest when the approval
 * gate was deleted.
 *
 * "Put it back" reverses a completed swap: the shift returns to whoever
 * originally offered it. Available until the shift starts -- afterwards
 * the shift has happened and the roster, not a planning row, is the
 * record of who worked it.
 *
 * Undo rather than approve, deliberately: it is the same veto, but it
 * costs nothing when unused and nothing can rot waiting for a click. If
 * the original person still can't work the shift, they offer it again.
 *
 * A REASON IS REQUIRED, for the same reason managerCancelSwapRequest
 * requires one: the two staff members see it verbatim on their own My
 * Schedule, and Atlas has no other channel to them. */
export async function putBackSwap(requestId: number, reason: string): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("SCHEDULE_MANAGE");

    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("Add a short reason — both people will see it");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");
    if (request.status !== "completed") throw new Error("Only a completed swap can be put back");

    const [requester] = await db.select().from(employees).where(eq(employees.id, request.requestingEmployeeId));
    const requesterName = requester?.nickname ?? "the person who offered it";

    if (request.assignmentId == null) throw new Error("The underlying shift no longer exists");
    const [assignment] = await db
      .select()
      .from(plannedShiftAssignments)
      .where(eq(plannedShiftAssignments.id, request.assignmentId));
    if (!assignment) throw new Error("The underlying shift no longer exists");
    if (assignment.date < businessTodayIso()) {
      throw new Error("That shift has already happened — adjust the roster for it instead");
    }

    // Same prepare-then-batch shape as accepting: the last refusal (a
    // finalized shift) happens before the first write, and the plan, the
    // roster row and the status all commit together.
    const move = await prepareSwapReversal(request);
    const statusQuery = db
      .update(swapRequests)
      .set({
        status: "put_back",
        cancelReason: trimmedReason,
        decidedAt: sql`(current_timestamp)`,
        decidedByEmployeeId: session.id,
      })
      .where(eq(swapRequests.id, requestId));

    // Any open offer on this same shift is void: the person who posted it
    // was the one who took the shift, and they no longer have it to give.
    // Left alone it would sit on the board as a takeable shift, and the
    // holder guard in prepareSwapCompletion would refuse it at the last
    // moment with an error -- better that it simply stops being offered.
    const voidOffersQuery = db
      .update(swapRequests)
      .set({
        status: "cancelled",
        cancelReason: `The shift went back to ${requesterName}, so this offer no longer applies.`,
        decidedAt: sql`(current_timestamp)`,
        decidedByEmployeeId: session.id,
      })
      .where(
        and(
          eq(swapRequests.assignmentId, request.assignmentId),
          eq(swapRequests.status, "open"),
          ne(swapRequests.id, requestId)
        )
      );

    if (move.rosterQuery) await db.batch([move.planQuery, move.rosterQuery, statusQuery, voidOffersQuery]);
    else await db.batch([move.planQuery, statusQuery, voidOffersQuery]);

    revalidateSwapPaths();
});
}
