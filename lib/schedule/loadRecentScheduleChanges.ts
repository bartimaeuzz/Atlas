import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduleChangeLog } from "@/db/schema";

export interface ScheduleChangeForEmployee {
  id: number;
  action: "CLEARED_DAY" | "DELETED_WEEK" | "REMOVED_ASSIGNMENT";
  date: string | null; // the specific date affected, if this employee had a shift that day
  positionName: string;
  period: "Lunch" | "Dinner";
  weekStartDate: string;
  wasPublished: boolean;
  reason: string | null;
  performedByName: string;
  createdAt: string;
}

const LOOKBACK_LIMIT = 200; // recent change-log rows to scan; plenty for a single restaurant's volume

/**
 * Staff-facing changelog (2026-08-14, Oliver: "at least they know what
 * is happening with their shift") -- flattens scheduleChangeLog rows
 * down to just the entries that actually affected THIS employee, one
 * row per affected date/position/period rather than one row per
 * clear/delete action (a single "delete week" can affect several of an
 * employee's shifts across different days).
 *
 * removedAssignments is stored as a JSON blob rather than normalized
 * rows (see schema.ts's comment on scheduleChangeLog) -- filtering by
 * employeeId happens in JS after a bounded recent-rows fetch rather
 * than a JSON1 SQL predicate, since this table is small for a single
 * restaurant and it keeps the query portable across SQLite/libSQL
 * without leaning on JSON functions that may differ between them.
 */
export async function loadRecentScheduleChanges(
  employeeId: number,
  options: { includeDraftChanges?: boolean } = {}
): Promise<ScheduleChangeForEmployee[]> {
  const rows = await db
    .select()
    .from(scheduleChangeLog)
    .orderBy(desc(scheduleChangeLog.createdAt))
    .limit(LOOKBACK_LIMIT);

  const result: ScheduleChangeForEmployee[] = [];

  for (const row of rows) {
    // Defaults to PUBLISHED-only -- a cleared/deleted DRAFT was never
    // visible to the employee in the first place, so it should never
    // leak into a staff-facing view by default. Caught by
    // verify_schedule_changelog.ts before shipping (a direct test of
    // this loader, not the page's own extra filter, is what caught it)
    // -- filtering used to live only in the page component, which
    // meant any FUTURE caller of this loader that forgot to filter
    // would leak drafts. Filtering here instead makes it safe by
    // default; a future manager-facing view can opt in explicitly.
    if (!options.includeDraftChanges && !row.wasPublished) continue;

    let removed: { employeeId: number; positionName: string; date: string; period: "Lunch" | "Dinner" }[] = [];
    try {
      removed = JSON.parse(row.removedAssignments);
    } catch {
      continue; // malformed row -- skip rather than crash the staff view
    }

    for (const r of removed) {
      if (r.employeeId !== employeeId) continue;
      result.push({
        id: row.id,
        action: row.action as "CLEARED_DAY" | "DELETED_WEEK" | "REMOVED_ASSIGNMENT",
        date: r.date,
        positionName: r.positionName,
        period: r.period,
        weekStartDate: row.weekStartDate,
        wasPublished: row.wasPublished,
        reason: row.reason,
        performedByName: row.performedByName,
        createdAt: row.createdAt,
      });
    }
  }

  return result;
}
