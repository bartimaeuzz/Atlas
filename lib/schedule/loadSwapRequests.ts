import { eq, and, gte, ne, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  swapRequests,
  plannedShiftAssignments,
  scheduleWeeks,
  employees,
  positions,
  employeePositions,
  notificationSeen,
} from "@/db/schema";

export interface SwapRequestView {
  id: number;
  assignmentId: number;
  date: string;
  period: "Lunch" | "Dinner";
  positionId: number;
  positionName: string;
  requestingEmployeeId: number;
  requestingEmployeeName: string;
  acceptingEmployeeId: number | null;
  acceptingEmployeeName: string | null;
  status: "open" | "pending_manager_approval" | "completed" | "declined" | "cancelled";
  note: string | null;
  createdAt: string;
}

/** Shared select shape for every loader below -- keeps the join list in
 * one place. `acceptingEmployeeName` needs a second join to employees,
 * so it's a separate query rather than reusing a single joined
 * queryBuilder object (drizzle doesn't alias-join the same table twice
 * from one builder without extra ceremony; a manual second lookup pass
 * is simpler and these lists are always small). */
async function hydrateAcceptingNames(rows: SwapRequestView[]): Promise<SwapRequestView[]> {
  const acceptingIds = [...new Set(rows.map((r) => r.acceptingEmployeeId).filter((id): id is number => id !== null))];
  if (acceptingIds.length === 0) return rows;
  const accepters = await db.select().from(employees).where(inArray(employees.id, acceptingIds));
  const nameById = new Map(accepters.map((e) => [e.id, e.nickname]));
  return rows.map((r) => ({
    ...r,
    acceptingEmployeeName: r.acceptingEmployeeId !== null ? nameById.get(r.acceptingEmployeeId) ?? null : null,
  }));
}

function baseSwapQuery() {
  return db
    .select({
      id: swapRequests.id,
      // From the JOINED table, not swapRequests.assignmentId: the FK is
      // nullable since 2026-08-30 (detached swaps), but this query
      // inner-joins the assignment, so rows here always have one -- and
      // the joined column's type says so honestly.
      assignmentId: plannedShiftAssignments.id,
      date: plannedShiftAssignments.date,
      period: plannedShiftAssignments.period,
      positionId: plannedShiftAssignments.positionId,
      positionName: positions.name,
      requestingEmployeeId: swapRequests.requestingEmployeeId,
      requestingEmployeeName: employees.nickname,
      acceptingEmployeeId: swapRequests.acceptingEmployeeId,
      status: swapRequests.status,
      note: swapRequests.note,
      createdAt: swapRequests.createdAt,
    })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .innerJoin(employees, eq(swapRequests.requestingEmployeeId, employees.id));
}

/** One employee's own posted swap requests, most recent first -- feeds
 * "My swap requests" on /me/schedule regardless of status (open,
 * pending, completed, declined, cancelled -- seeing the full history,
 * including past outcomes, is the point). */
export async function loadMySwapRequests(employeeId: number): Promise<SwapRequestView[]> {
  const rows = await baseSwapQuery().where(eq(swapRequests.requestingEmployeeId, employeeId));
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null })));
  return withNames.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Open swap requests a given employee is eligible to accept: status
 * still "open", not their own request, assignment date hasn't passed,
 * and they actively hold the assignment's position (system-enforced
 * eligibility, confirmed with Oliver). */
export async function loadAcceptableSwapRequests(employeeId: number, todayIso: string): Promise<SwapRequestView[]> {
  const myPositions = await db
    .select({ positionId: employeePositions.positionId })
    .from(employeePositions)
    .where(and(eq(employeePositions.employeeId, employeeId), eq(employeePositions.isActive, true)));
  const myPositionIds = myPositions.map((p) => p.positionId);
  if (myPositionIds.length === 0) return [];

  const rows = await baseSwapQuery().where(
    and(
      eq(swapRequests.status, "open"),
      ne(swapRequests.requestingEmployeeId, employeeId),
      gte(plannedShiftAssignments.date, todayIso),
      inArray(plannedShiftAssignments.positionId, myPositionIds)
    )
  );
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null })));
  return withNames.sort((a, b) => a.date.localeCompare(b.date));
}

/** An employee's own upcoming, published-week assignments that don't
 * already have a live swap request against them (open or pending) --
 * the picklist for "offer a shift for swap." Past dates are excluded;
 * unpublished (draft) weeks are excluded (confirmed scope: published
 * shifts only). */
export async function loadMySwappableAssignments(
  employeeId: number,
  todayIso: string
): Promise<{ assignmentId: number; date: string; period: "Lunch" | "Dinner"; positionName: string }[]> {
  const rows = await db
    .select({
      assignmentId: plannedShiftAssignments.id,
      date: plannedShiftAssignments.date,
      period: plannedShiftAssignments.period,
      positionName: positions.name,
    })
    .from(plannedShiftAssignments)
    .innerJoin(scheduleWeeks, eq(plannedShiftAssignments.weekId, scheduleWeeks.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .where(
      and(
        eq(plannedShiftAssignments.employeeId, employeeId),
        eq(scheduleWeeks.status, "published"),
        gte(plannedShiftAssignments.date, todayIso)
      )
    );

  const liveRequests = await db
    .select({ assignmentId: swapRequests.assignmentId })
    .from(swapRequests)
    .where(inArray(swapRequests.status, ["open", "pending_manager_approval"]));
  const blockedAssignmentIds = new Set(liveRequests.map((r) => r.assignmentId));

  return rows.filter((r) => !blockedAssignmentIds.has(r.assignmentId)).sort((a, b) => a.date.localeCompare(b.date));
}

/** Manager-facing inbox: every swap request whose shift date hasn't
 * passed, pending-approval ones first (need a decision), then open,
 * then recently completed/declined -- mirrors loadUpcomingLeaveRequests
 * in spirit (a log the manager can act on where action's needed, and
 * otherwise just review). */
export async function loadSwapRequestsForManager(todayIso: string): Promise<SwapRequestView[]> {
  const rows = await baseSwapQuery().where(
    and(gte(plannedShiftAssignments.date, todayIso), ne(swapRequests.status, "cancelled"))
  );
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null })));
  const statusRank: Record<string, number> = { pending_manager_approval: 0, open: 1, completed: 2, declined: 3 };
  return withNames.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || a.date.localeCompare(b.date));
}

/** Count of swap requests the manager hasn't seen yet, for the nav red
 * pill -- same "no row = never visited = everything unseen" convention
 * as loadUnseenLeaveRequestCount, sharing the same notificationSeen
 * table under the "swap_requests" section. "Unseen" here means
 * respondedAt (someone accepted, whichever path followed) is after the
 * manager's lastSeenAt -- an OPEN request nobody's touched yet doesn't
 * need a manager's attention, so it doesn't count. */
export async function loadUnseenSwapCount(managerEmployeeId: number, todayIso: string): Promise<number> {
  const [seenRow] = await db
    .select({ lastSeenAt: notificationSeen.lastSeenAt })
    .from(notificationSeen)
    .where(and(eq(notificationSeen.employeeId, managerEmployeeId), eq(notificationSeen.section, "swap_requests")));

  const responded = await db
    .select({ respondedAt: swapRequests.respondedAt })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .where(and(gte(plannedShiftAssignments.date, todayIso), inArray(swapRequests.status, ["open", "pending_manager_approval", "completed"])));

  const rows = responded.filter((r): r is { respondedAt: string } => r.respondedAt !== null);
  if (!seenRow) return rows.length;
  return rows.filter((r) => r.respondedAt > seenRow.lastSeenAt).length;
}

/** assignmentId -> swap status, for one week's worth of assignments --
 * feeds the Weekly Plan grid's GREEN (completed swap) / blue (accepted,
 * awaiting manager approval) ring, same DERIVED-at-read-time pattern as
 * onLeave/vacatingSoon in loadWeeklyPlan.ts. Only pending_manager_approval
 * and completed are shown -- open/declined/cancelled requests haven't
 * changed who's actually on the slot, nothing to flag on the grid. */
export async function loadSwapStatusByAssignmentForWeek(
  weekId: number
): Promise<Map<number, { status: "open" | "pending_manager_approval" | "completed"; requestingEmployeeName: string }>> {
  const rows = await db
    .select({
      // Joined table's id, not the nullable FK -- same reasoning as
      // baseSwapQuery above.
      assignmentId: plannedShiftAssignments.id,
      status: swapRequests.status,
      requestingEmployeeName: employees.nickname,
    })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .innerJoin(employees, eq(swapRequests.requestingEmployeeId, employees.id))
    .where(
      and(eq(plannedShiftAssignments.weekId, weekId), inArray(swapRequests.status, ["open", "pending_manager_approval", "completed"]))
    );

  const byAssignment = new Map<number, { status: "open" | "pending_manager_approval" | "completed"; requestingEmployeeName: string }>();
  for (const r of rows) {
    byAssignment.set(r.assignmentId, {
      status: r.status as "open" | "pending_manager_approval" | "completed",
      requestingEmployeeName: r.requestingEmployeeName,
    });
  }
  return byAssignment;
}
