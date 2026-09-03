import { and, gte, lte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests } from "@/db/schema";

/** The "is this person off that day" rule, in one place (2026-09-03).
 *
 * It was inline in three places before this file existed -- the manual
 * replace guard, the "+ Add" picker's warning, and loadWeeklyPlan's badge
 * -- and auto-fill and template generation, which both write rows, had no
 * copy of it at all. That is exactly how production ended up with seven
 * planned assignments sitting on top of approved leave.
 *
 * The rule itself: a request blocks a date when its status is anything
 * other than "denied" (so PENDING blocks too -- someone who asked for the
 * day off is not a safe default to schedule) and its inclusive range
 * covers that date. This matches replacePlannedAssignment exactly; it is
 * deliberately not loosened to "approved only". */
export type OnLeaveLookup = (employeeId: number, dateIso: string) => boolean;

export interface LeaveSpan {
  employeeId: number;
  startDate: string;
  endDate: string;
}

/** Pure half, so the overlap arithmetic is unit-testable without a db. */
export function buildOnLeaveLookup(spans: LeaveSpan[]): OnLeaveLookup {
  const byEmployee = new Map<number, LeaveSpan[]>();
  for (const s of spans) {
    const list = byEmployee.get(s.employeeId) ?? [];
    list.push(s);
    byEmployee.set(s.employeeId, list);
  }
  return (employeeId, dateIso) =>
    (byEmployee.get(employeeId) ?? []).some((s) => s.startDate <= dateIso && s.endDate >= dateIso);
}

/** Bounded in SQL rather than reading the whole table and filtering in JS:
 * leave_requests grows without limit, and only rows OVERLAPPING the window
 * can matter. Overlap is (start <= lastDate AND end >= firstDate), which
 * deliberately catches a span that begins before the window or ends after
 * it -- a Sunday-to-Wednesday leave still blocks that week's Monday. */
export async function loadOnLeaveLookup(firstDate: string, lastDate: string): Promise<OnLeaveLookup> {
  const rows = await db
    .select({
      employeeId: leaveRequests.employeeId,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .where(
      and(
        ne(leaveRequests.status, "denied"),
        lte(leaveRequests.startDate, lastDate),
        gte(leaveRequests.endDate, firstDate)
      )
    );
  return buildOnLeaveLookup(rows);
}
