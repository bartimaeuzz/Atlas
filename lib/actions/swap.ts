"use server";

/** Shift swap requests (2026-08-16, Schedule Planner Phase E). See
 * db/schema.ts's swapRequests comment for the full state machine and
 * design reasoning -- confirmed with Oliver across two rounds of
 * AskUserQuestion before any of this was written. */

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { revalidatePath } from "next/cache";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, scheduleWeeks, employeePositions, leaveRequests } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { toIso, daysBetween } from "@/lib/schedule/weekMath";
import { completeSwap } from "@/lib/schedule/completeSwap";

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

const APPROVAL_WINDOW_DAYS = 3; // <=3 days out needs a manager decision; further out auto-completes

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
    const today = toIso(new Date());
    if (assignment.date < today) {
      throw new Error("That shift has already passed");
    }

    const [liveRequest] = await db
      .select()
      .from(swapRequests)
      .where(
        and(eq(swapRequests.assignmentId, assignmentId), inArray(swapRequests.status, ["open", "pending_manager_approval"]))
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

/** A coworker accepts an open swap request. Re-checks every eligibility
 * rule server-side: must actively hold the position, can't accept your
 * own request, can't already be assigned elsewhere at that exact
 * date+period, can't be on logged leave that day. Shifts due <=3 days
 * out go to pending_manager_approval instead of completing immediately
 * (confirmed with Oliver: closer-in swaps need a manager's eyes on
 * them; anything further out just notifies the manager after the
 * fact). */
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

    const onLeave = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.employeeId, session.id));
    if (onLeave.some((l) => assignment.date >= l.startDate && assignment.date <= l.endDate)) {
      throw new Error("You have leave logged over that date");
    }

    const today = toIso(new Date());
    const daysOut = daysBetween(today, assignment.date);
    const needsApproval = daysOut <= APPROVAL_WINDOW_DAYS;

    await db
      .update(swapRequests)
      .set({
        acceptingEmployeeId: session.id,
        status: needsApproval ? "pending_manager_approval" : "completed",
        respondedAt: sql`(current_timestamp)`,
      })
      .where(eq(swapRequests.id, requestId));

    if (!needsApproval) {
      const [updated] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
      await completeSwap(updated);
    }

    revalidateSwapPaths();
});
}

/** Manager approves a swap that's within the <=3-day window. */
export async function approveSwapRequest(requestId: number): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    // Tightened 2026-08-24 from the coarse manager-role check to
    // SCHEDULE_MANAGE -- swap decisions belong to whoever runs the
    // schedule, same as the capability's own label always claimed.
    const session = await requireCapability("SCHEDULE_MANAGE");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");
    if (request.status !== "pending_manager_approval") throw new Error("That request isn't awaiting approval");

    await completeSwap(request);
    await db
      .update(swapRequests)
      .set({ status: "completed", decidedAt: sql`(current_timestamp)`, decidedByEmployeeId: session.id })
      .where(eq(swapRequests.id, requestId));

    revalidateSwapPaths();
});
}

/** Manager declines a pending swap -- confirmed with Oliver: the shift
 * simply reverts to the original requester (it was never actually
 * reassigned during the pending state, so this is just closing out the
 * request, not undoing anything). */
export async function declineSwapRequest(requestId: number): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    // Tightened 2026-08-24 -- see approveSwapRequest above.
    const session = await requireCapability("SCHEDULE_MANAGE");

    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");
    if (request.status !== "pending_manager_approval") throw new Error("That request isn't awaiting approval");

    await db
      .update(swapRequests)
      .set({ status: "declined", decidedAt: sql`(current_timestamp)`, decidedByEmployeeId: session.id })
      .where(eq(swapRequests.id, requestId));

    revalidateSwapPaths();
});
}
