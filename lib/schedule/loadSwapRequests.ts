import { eq, and, gte, ne, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { expireStaleSwaps } from "@/lib/schedule/expireStaleSwaps";
import {
  swapRequests,
  plannedShiftAssignments,
  scheduleWeeks,
  employees,
  positions,
  employeePositions,
  notificationSeen,
} from "@/db/schema";

/** Every status the column can hold, derived from the schema so a new
 * one cannot be added without every consumer of this type being
 * type-checked against it (2026-09-03: "put_back", "unclaimed" and
 * "unresolved" arrived this way, and tsc found all five call sites). */
export type SwapStatus = (typeof swapRequests.$inferSelect)["status"];

/** Statuses that still describe a LIVE promise to a staff member -- the
 * only ones that block deleting the schedule they point at, and the only
 * ones a manager can still act on. Everything else is history. */
export const LIVE_SWAP_STATUSES = ["open"] as const;

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
  status: SwapStatus;
  note: string | null;
  createdAt: string;
  /** Set when a MANAGER cancelled this request (2026-08-30) or put a
   * completed swap back (2026-09-03): the reason they typed, shown
   * VERBATIM to both staff members, and who did it. Both null on a staff
   * self-cancel and on every other status. */
  cancelReason: string | null;
  cancelledByEmployeeId: number | null;
  cancelledByName: string | null;
  /** Every hand-off this shift has been through, oldest first, when it
   * has been through more than one -- "Meji, Erika" reads on screen as
   * Meji → Erika → open (2026-09-03, the re-offer chain). Empty for the
   * ordinary single-swap case, which is almost all of them. A shift can
   * be re-offered because after a swap completes it genuinely belongs to
   * the person who took it, so "offer this shift" works on it with no
   * new state -- the chain is derived from the existing rows. */
  chain: string[];
}

/** Shared select shape for every loader below -- keeps the join list in
 * one place. `acceptingEmployeeName` needs a second join to employees,
 * so it's a separate query rather than reusing a single joined
 * queryBuilder object (drizzle doesn't alias-join the same table twice
 * from one builder without extra ceremony; a manual second lookup pass
 * is simpler and these lists are always small). */
async function hydrateAcceptingNames(rows: SwapRequestView[]): Promise<SwapRequestView[]> {
  // One lookup pass covers accepters AND manager-cancellers (2026-08-30)
  // -- same second-join-avoidance reasoning as the comment above.
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => [
          r.acceptingEmployeeId,
          r.status === "cancelled" || r.status === "put_back" ? r.cancelledByEmployeeId : null,
        ])
        .filter((id): id is number => id !== null)
    ),
  ];
  if (ids.length === 0) return rows;
  const people = await db.select().from(employees).where(inArray(employees.id, ids));
  const nameById = new Map(people.map((e) => [e.id, e.nickname]));
  return rows.map((r) => ({
    ...r,
    acceptingEmployeeName: r.acceptingEmployeeId !== null ? nameById.get(r.acceptingEmployeeId) ?? null : null,
    cancelledByName:
      (r.status === "cancelled" || r.status === "put_back") && r.cancelledByEmployeeId !== null
        ? nameById.get(r.cancelledByEmployeeId) ?? null
        : null,
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
      cancelReason: swapRequests.cancelReason,
      cancelledByEmployeeId: swapRequests.decidedByEmployeeId,
    })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .innerJoin(employees, eq(swapRequests.requestingEmployeeId, employees.id));
}

/** Every swap this employee is a party to, either side, most recent
 * first -- feeds "My swap requests" on /me/schedule regardless of status
 * (seeing the full history, including past outcomes, is the point). */
export async function loadMySwapRequests(employeeId: number): Promise<SwapRequestView[]> {
  // Both sides, not just the requester (2026-09-03). The person who TOOK
  // a shift has to be told when a manager puts it back -- they lose a
  // shift they were counting on, and the manager's reason is written to
  // them as much as to the requester. Filtering on requestingEmployeeId
  // alone meant that notice reached only one of the two people it named.
  const rows = await baseSwapQuery().where(
    or(eq(swapRequests.requestingEmployeeId, employeeId), eq(swapRequests.acceptingEmployeeId, employeeId))
  );
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null, cancelledByName: null, chain: [] })));
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
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null, cancelledByName: null, chain: [] })));
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
/** Fills in `chain` for shifts that have been handed off more than once.
 * Derived, not stored: every completed swap on the same assignment, in
 * order, is the chain. Meji offers, Erika takes it, Erika later offers
 * the same shift -- the open request carries ["Meji", "Erika"] so the
 * manager reads Meji → Erika → open instead of a bare "Erika" that hides
 * where the shift came from. */
async function hydrateChains(rows: SwapRequestView[]): Promise<SwapRequestView[]> {
  const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
  if (assignmentIds.length === 0) return rows;

  const history = await db
    .select({
      id: swapRequests.id,
      assignmentId: swapRequests.assignmentId,
      requesterId: swapRequests.requestingEmployeeId,
      accepterId: swapRequests.acceptingEmployeeId,
      createdAt: swapRequests.createdAt,
    })
    .from(swapRequests)
    .where(and(inArray(swapRequests.assignmentId, assignmentIds), eq(swapRequests.status, "completed")));
  if (history.length === 0) return rows;

  const ids = [...new Set(history.flatMap((h) => [h.requesterId, h.accepterId]).filter((v): v is number => v !== null))];
  const people = await db.select().from(employees).where(inArray(employees.id, ids));
  const nameById = new Map(people.map((e) => [e.id, e.nickname]));

  const byAssignment = new Map<number, typeof history>();
  for (const h of history) {
    if (h.assignmentId == null) continue;
    const list = byAssignment.get(h.assignmentId) ?? [];
    list.push(h);
    byAssignment.set(h.assignmentId, list);
  }

  return rows.map((r) => {
    const hops = (byAssignment.get(r.assignmentId) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // A chain is worth showing only when this shift changed hands BEFORE
    // this row -- that is what makes it a re-offer. Judged by hops other
    // than r itself, not by hop count: the commonest re-offer is exactly
    // one completed swap (Meji → Erika) plus Erika's new open offer, and
    // counting hops alone hid precisely that case. A lone completed swap
    // viewed as itself needs no chain -- the row already reads Meji → Erika.
    if (!hops.some((h) => h.id !== r.id)) return r;
    const names: string[] = [];
    for (const h of hops) {
      const from = nameById.get(h.requesterId);
      if (from && names[names.length - 1] !== from) names.push(from);
      const to = h.accepterId === null ? null : nameById.get(h.accepterId);
      if (to && names[names.length - 1] !== to) names.push(to);
    }
    return { ...r, chain: names };
  });
}

export async function loadSwapRequestsForManager(todayIso: string): Promise<SwapRequestView[]> {
  // Close out anything whose shift has already happened before reading --
  // a past-date request is history, and leaving it "open" blocked deleting
  // the week it points at (see expireStaleSwaps).
  await expireStaleSwaps(todayIso);

  // Live requests show REGARDLESS of date (2026-08-30): a stale open swap
  // on a shift that already happened is precisely what blocked the
  // danger-zone deleters, and this page is where the blocking message
  // sends the manager -- filtering it out by date made that message a
  // dead end. Since 2026-09-03 the sweep above closes those out, so this
  // clause now only catches one opened for TODAY; it stays because the
  // sweep is date-based and "today" is not past.
  const rows = await baseSwapQuery().where(
    and(
      ne(swapRequests.status, "cancelled"),
      or(inArray(swapRequests.status, LIVE_SWAP_STATUSES), gte(plannedShiftAssignments.date, todayIso))
    )
  );
  const withNames = await hydrateAcceptingNames(rows.map((r) => ({ ...r, acceptingEmployeeName: null, cancelledByName: null, chain: [] })));
  const withChains = await hydrateChains(withNames);
  // Open offers first, soonest shift first: an unclaimed shift that is
  // nearly here is the only thing on this page anyone can still act on.
  // Completed swaps follow (the manager can still put one back), then the
  // closed-out log.
  const statusRank: Record<SwapStatus, number> = {
    open: 0,
    completed: 1,
    pending_manager_approval: 2,
    put_back: 3,
    unresolved: 4,
    unclaimed: 5,
    declined: 6,
    cancelled: 7,
  };
  return withChains.sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.date.localeCompare(b.date));
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
 * never settled under the old approval rule) ring, same DERIVED-at-read-time pattern as
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
