"use server";

/** Leave requests (2026-08-16, Schedule Planner Phase D). Self-service,
 * no approval step -- confirmed with Oliver: by the time an employee
 * logs one, they've already told the manager informally, this just
 * pushes it into a log/calendar so the manager doesn't forget. See
 * db/schema.ts's leaveRequests comment for the full design reasoning. */

import { revalidatePath } from "next/cache";
import { businessTodayIso } from "@/lib/formatDateTime";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";

export interface LeaveRequestActionState {
  error: string | null;
}

export async function submitLeaveRequest(
  _prevState: LeaveRequestActionState,
  formData: FormData
): Promise<LeaveRequestActionState> {
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    if (!startDate || !endDate) throw new Error("Enter both dates");
    if (endDate < startDate) throw new Error("End date can't be before the start date");
    // Same "today" convention as loadUpcomingLeaveRequests' gte filter.
    if (startDate < businessTodayIso()) throw new Error("Start date can't be in the past");

    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    await db.insert(leaveRequests).values({ employeeId: session.id, startDate, endDate, note });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/me/schedule");
  revalidatePath("/schedule/leave");
  revalidatePath("/schedule/plan");
  return { error: null };
}

/** Approve or deny a pending leave request (2026-08-24 — Oliver
 * reversed the original no-approval design). Gated on SCHEDULE_MANAGE,
 * same capability that owns every other Weekly Plan mutation: the
 * person who runs the schedule is the person who rules on leave.
 * Re-deciding an already-decided request is allowed on purpose — plans
 * change, and cancel-and-resubmit would lose the original loggedAt. */
export async function decideLeaveRequest(
  requestId: number,
  decision: "approved" | "denied"
): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors (see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("SCHEDULE_MANAGE");

    const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");

    await db
      .update(leaveRequests)
      .set({ status: decision, decidedByEmployeeId: session.id, decidedAt: new Date().toISOString() })
      .where(eq(leaveRequests.id, requestId));

    revalidatePath("/me/schedule");
    revalidatePath("/schedule/leave");
    revalidatePath("/schedule/plan");
  });
}

/** Cancel a leave request -- the employee who logged it, or any
 * manager/admin (e.g. correcting an entry, or the plan changed), can
 * remove it. No separate "edit" -- plans that change are cancelled and
 * re-submitted, same lightweight spirit as the rest of this table. */
export async function deleteLeaveRequest(requestId: number) {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
  if (!request) return;

  // Owners always may cancel their own; anyone else needs SCHEDULE_MANAGE
  // (tightened 2026-08-24 from the coarse manager-role check — removing
  // someone else's leave is a schedule change like any other).
  const isOwner = request.employeeId === session.id;
  if (!isOwner) {
    await requireCapability("SCHEDULE_MANAGE");
  }

  await db.delete(leaveRequests).where(eq(leaveRequests.id, requestId));
  revalidatePath("/me/schedule");
  revalidatePath("/schedule/leave");
  revalidatePath("/schedule/plan");
}
