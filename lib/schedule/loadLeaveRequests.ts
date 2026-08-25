import { eq, desc, gte, lte, and, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { leaveRequests, employees, notificationSeen } from "@/db/schema";

/** Second employees join for the decider's name on decided requests. */
const deciders = alias(employees, "deciders");

export interface LeaveRequestView {
  id: number;
  employeeId: number;
  employeeName: string;
  startDate: string;
  endDate: string;
  note: string | null;
  loggedAt: string;
  status: "pending" | "approved" | "denied";
  decidedByName: string | null;
}

/** One employee's own leave requests, most recent first -- feeds the
 * "My leave requests" section on /me/schedule. */
export async function loadMyLeaveRequests(employeeId: number): Promise<LeaveRequestView[]> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.nickname,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      note: leaveRequests.note,
      loggedAt: leaveRequests.loggedAt,
      status: leaveRequests.status,
      decidedByName: deciders.nickname,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(deciders, eq(leaveRequests.decidedByEmployeeId, deciders.id))
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
      employeeName: employees.nickname,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      note: leaveRequests.note,
      loggedAt: leaveRequests.loggedAt,
      status: leaveRequests.status,
      decidedByName: deciders.nickname,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .leftJoin(deciders, eq(leaveRequests.decidedByEmployeeId, deciders.id))
    .where(and(gte(leaveRequests.endDate, todayIso)))
    .orderBy(leaveRequests.startDate);
  return rows;
}

/** Count of upcoming/active leave requests a given manager hasn't seen
 * yet -- powers the red-pill badge on the nav's Schedule item
 * (2026-08-16). "Unseen" = loggedAt is after this employee's
 * notificationSeen row for the "leave_requests" section, OR they have no
 * row at all (never visited -- everything currently in the inbox counts
 * as unseen, not zero). Mirrors loadUpcomingLeaveRequests's own
 * endDate >= today filter so the count always matches what's actually
 * visible on /schedule/leave. */
export async function loadUnseenLeaveRequestCount(managerEmployeeId: number, todayIso: string): Promise<number> {
  const [seenRow] = await db
    .select({ lastSeenAt: notificationSeen.lastSeenAt })
    .from(notificationSeen)
    .where(and(eq(notificationSeen.employeeId, managerEmployeeId), eq(notificationSeen.section, "leave_requests")));

  const upcoming = await db
    .select({ loggedAt: leaveRequests.loggedAt })
    .from(leaveRequests)
    .where(gte(leaveRequests.endDate, todayIso));

  if (!seenRow) return upcoming.length;
  return upcoming.filter((r) => r.loggedAt > seenRow.lastSeenAt).length;
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
  // Denied requests don't flag anything — the employee is expected to work.
  // Pending ones still do (confirmed with Oliver 2026-08-24): safer for the
  // scheduler to see a warning that may clear than to be surprised later.
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        lte(leaveRequests.startDate, weekEnd),
        gte(leaveRequests.endDate, weekStart),
        ne(leaveRequests.status, "denied")
      )
    );
  const byEmployee = new Map<number, { startDate: string; endDate: string; note: string | null }[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push({ startDate: r.startDate, endDate: r.endDate, note: r.note });
    byEmployee.set(r.employeeId, list);
  }
  return byEmployee;
}
