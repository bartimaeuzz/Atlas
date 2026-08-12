import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  scheduleWeeks,
  plannedShiftAssignments,
  employeeScheduleTemplates,
  positions,
  positionStaffingTargets,
} from "@/db/schema";
import { addDays, dayOfWeek, monthLabel, monthStart, shiftMonth, weekStartFor } from "@/lib/schedule/weekMath";
import { projectAssignmentsForWeek } from "@/lib/schedule/projectTemplate";

export interface MonthDay {
  date: string;
  inMonth: boolean;
  /** "published"/"draft" if that week has actually been generated,
   * "projected" if this is a forward-looking estimate computed live
   * from the recurring template (2026-08-11, Oliver: wants to "zoom
   * out" and see what's coming even for weeks nobody has clicked
   * Generate on yet, not just what's already been built). */
  weekStatus: "published" | "draft" | "projected";
  /** How many (position, period) slots with a staffing target are
   * currently under that target on this day — 0 means fully covered
   * (by template projection or actual plan, whichever applies). */
  shortfallCells: number;
  /** How many (position, period) slots have a target > 0 at all on
   * this day — lets the UI show "fully staffed" vs "nothing scheduled
   * here" differently. */
  targetCells: number;
}

export interface MonthOverviewData {
  monthAnchor: string;
  monthLabel: string;
  /** Calendar rows, Sunday..Saturday, enough rows to cover the whole
   * month (leading/trailing days from adjacent months included so the
   * grid is always a full rectangle, marked inMonth: false). */
  weeks: MonthDay[][];
}

/** Powers the Schedule Planner's month "zoom out" view. For weeks that
 * already have a scheduleWeeks row, counts real plannedShiftAssignments.
 * For weeks that don't exist yet, projects what generateWeekFromTemplate
 * WOULD produce (same projectAssignmentsForWeek helper the real action
 * uses) without writing anything — so the month view always reflects
 * your realistic future, not just what's been manually generated so
 * far. */
export async function loadMonthOverview(monthAnchor: string): Promise<MonthOverviewData> {
  const firstOfMonth = monthStart(monthAnchor);
  const lastOfMonth = addDays(shiftMonth(monthAnchor, 1), -1);

  const gridStart = addDays(firstOfMonth, -dayOfWeek(firstOfMonth));
  const gridEnd = addDays(lastOfMonth, 6 - dayOfWeek(lastOfMonth));

  const allDates: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) allDates.push(d);

  const weekStarts = Array.from(new Set(allDates.map((d) => weekStartFor(d))));

  const [existingWeeks, templateRows, activePositions, targetRows] = await Promise.all([
    db.select().from(scheduleWeeks).where(inArray(scheduleWeeks.weekStartDate, weekStarts)),
    db.select().from(employeeScheduleTemplates).where(eq(employeeScheduleTemplates.active, true)),
    db.select({ id: positions.id }).from(positions).where(eq(positions.active, true)),
    db.select().from(positionStaffingTargets),
  ]);

  const activePositionIds = new Set(activePositions.map((p) => p.id));

  const targets: Record<string, number> = {};
  for (const row of targetRows) {
    if (!activePositionIds.has(row.positionId)) continue;
    targets[`${row.positionId}:${row.dayOfWeek}:${row.period}`] = row.targetCount;
  }

  const weekByStart = new Map(existingWeeks.map((w) => [w.weekStartDate, w]));

  const generatedWeekIds = existingWeeks.map((w) => w.id);
  const actualAssignments =
    generatedWeekIds.length > 0
      ? await db
          .select({
            weekId: plannedShiftAssignments.weekId,
            positionId: plannedShiftAssignments.positionId,
            date: plannedShiftAssignments.date,
            period: plannedShiftAssignments.period,
          })
          .from(plannedShiftAssignments)
          .where(inArray(plannedShiftAssignments.weekId, generatedWeekIds))
      : [];

  // "date:period:positionId" -> assigned count, filled in per-week below
  // (actual for generated weeks, projected for weeks that don't exist yet).
  const countsByDatePositionPeriod = new Map<string, number>();
  function bump(date: string, positionId: number, period: string) {
    const key = `${date}:${period}:${positionId}`;
    countsByDatePositionPeriod.set(key, (countsByDatePositionPeriod.get(key) ?? 0) + 1);
  }

  for (const a of actualAssignments) {
    bump(a.date, a.positionId, a.period);
  }

  const projectableTemplateRows = templateRows.map((t) => ({
    employeeId: t.employeeId,
    positionId: t.positionId,
    dayOfWeek: t.dayOfWeek,
    period: t.period as "Lunch" | "Dinner",
    effectiveFrom: t.effectiveFrom,
    vacancyStartsOn: t.vacancyStartsOn,
  }));

  for (const weekStart of weekStarts) {
    if (weekByStart.has(weekStart)) continue; // already counted from actual data above
    const projected = projectAssignmentsForWeek(weekStart, projectableTemplateRows);
    for (const p of projected) bump(p.date, p.positionId, p.period);
  }

  const weeks: MonthDay[][] = [];
  for (let i = 0; i < allDates.length; i += 7) {
    weeks.push(
      allDates.slice(i, i + 7).map((date) => {
        const dow = dayOfWeek(date);
        const weekStart = weekStartFor(date);
        const existing = weekByStart.get(weekStart);
        const weekStatus: MonthDay["weekStatus"] = existing
          ? (existing.status as "draft" | "published")
          : "projected";

        let shortfallCells = 0;
        let targetCells = 0;
        for (const period of ["Lunch", "Dinner"] as const) {
          for (const positionId of activePositionIds) {
            const target = targets[`${positionId}:${dow}:${period}`] ?? 0;
            if (target <= 0) continue;
            targetCells++;
            const assigned = countsByDatePositionPeriod.get(`${date}:${period}:${positionId}`) ?? 0;
            if (assigned < target) shortfallCells++;
          }
        }

        return {
          date,
          inMonth: date >= firstOfMonth && date <= lastOfMonth,
          weekStatus,
          shortfallCells,
          targetCells,
        };
      })
    );
  }

  return { monthAnchor, monthLabel: monthLabel(monthAnchor), weeks };
}
