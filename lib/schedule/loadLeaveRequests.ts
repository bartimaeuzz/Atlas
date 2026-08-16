import { eq, desc, gte, and } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests, employees } from "@/db/schema";

export interface LeaveRequestView {
  id: number;
  employeeId: number;
  employeeName: string;
  startDate: string;
  endDate: string;
  note: string | null;
  loggedAt: string;
}

/** One employee's own leave requests, most recent first -- feeds the
 * "My leave requests" section on /me/schedule. */
export async function loadMyLeaveRequests(employeeId: number): Promise<LeaveRequestView[]> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      note: leaveRequests.note,
      loggedAt: leaveRequests.loggedAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(eq(leaveRequests.employeeId, employeeId))
    .orderBy(desc(leaveRequests.startDate));
  return rows;
}

/** The manager-facing inbox/log Oliver asked for ("a Notification / Log
 * Box that tells the Manager a change is coming") -- every employee's
 * leave requests whose END date hasn't passed yet (still relevant to
 * plan around), most upcoming first. Past requests roll off rather than
 * cluttering the inbox forever; nothing is ever deleted from the table
 * on that basis though, only via deleteLeaveRequest. */
export async function loadUpcomingLeaveRequests(todayIso: string): Promise<LeaveRequestView[]> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      note: leaveRequests.note,
      loggedAt: leaveRequests.loggedAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(and(gte(leaveRequests.endDate, todayIso)))
    .orderBy(leaveRequests.startDate);
  return rows;
}

/** employeeId -> every leave request that overlaps the given week's
 * date range at all -- used by loadWeeklyPlan.ts to flag a template-
 * sourced assignment as "needs coverage, employee is on leave" without
 * a separate query per assignment row. */
export async function loadLeaveByEmployeeForRange(
  weekStart: string,
  weekEnd: string
): Promise<Map<number, { startDate: string; endDate: string; note: string | null }[]>> {
  // Overlap test: request.startDate <= weekEnd AND request.endDate >= weekStart.
  const rows = await db.select().from(leaveRequests);
  const byEmployee = new Map<number, { startDate: string; endDate: string; note: string | null }[]>();
  for (const r of rows) {
    if (r.startDate > weekEnd || r.endDate < weekStart) continue;
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push({ startDate: r.startDate, endDate: r.endDate, note: r.note });
    byEmployee.set(r.employeeId, list);
  }
  return byEmployee;
}
