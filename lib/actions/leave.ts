"use server";

/** Leave requests (2026-08-16, Schedule Planner Phase D). Self-service,
 * no approval step -- confirmed with Oliver: by the time an employee
 * logs one, they've already told the manager informally, this just
 * pushes it into a log/calendar so the manager doesn't forget. See
 * db/schema.ts's leaveRequests comment for the full design reasoning. */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";

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

/** Cancel a leave request -- the employee who logged it, or any
 * manager/admin (e.g. correcting an entry, or the plan changed), can
 * remove it. No separate "edit" -- plans that change are cancelled and
 * re-submitted, same lightweight spirit as the rest of this table. */
export async function deleteLeaveRequest(requestId: number) {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
  if (!request) return;

  const isOwner = request.employeeId === session.id;
  const isManager = session.systemRole === "MANAGER" || session.systemRole === "ADMIN";
  if (!isOwner && !isManager) {
    throw new Error("You can only cancel your own leave requests.");
  }

  await db.delete(leaveRequests).where(eq(leaveRequests.id, requestId));
  revalidatePath("/me/schedule");
  revalidatePath("/schedule/leave");
  revalidatePath("/schedule/plan");
}
