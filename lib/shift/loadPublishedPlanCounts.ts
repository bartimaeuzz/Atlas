import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { plannedShiftAssignments, scheduleWeeks } from "@/db/schema";

/** How many people the PUBLISHED weekly plan has for each date+period of
 * one month, keyed `${date}|${period}` (2026-08-25, Oliver: the create
 * popup offers "pull data from assignment or start fresh", so the month
 * view needs to know which slots have a plan to pull). Only published
 * weeks count -- same rule as seedRosterFromPublishedPlan: a draft plan
 * is not trustworthy enough to offer as seed data. Bounded by the month
 * in the WHERE, not filtered in JS. */
export async function loadPublishedPlanCounts(month: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ date: plannedShiftAssignments.date, period: plannedShiftAssignments.period })
    .from(plannedShiftAssignments)
    .innerJoin(scheduleWeeks, eq(plannedShiftAssignments.weekId, scheduleWeeks.id))
    .where(
      and(
        eq(scheduleWeeks.status, "published"),
        gte(plannedShiftAssignments.date, `${month}-01`),
        lte(plannedShiftAssignments.date, `${month}-31`)
      )
    );
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.date}|${r.period}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
