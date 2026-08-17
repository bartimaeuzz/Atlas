import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduleWeeks, plannedShiftAssignments, employeeScheduleTemplates, employees, positions } from "@/db/schema";
import { addDays, dayOfWeek, monthLabel, monthStart, shiftMonth, weekStartFor } from "@/lib/schedule/weekMath";
import { projectAssignmentsForWeek } from "@/lib/schedule/projectTemplate";

export interface EmployeeScheduleShift {
  positionId: number;
  positionName: string;
  period: "Lunch" | "Dinner";
  isExtraCoverage: boolean;
}

export interface EmployeeScheduleDay {
  date: string;
  inMonth: boolean;
  /** Same meaning as loadMonthOverview's per-day status — "projected"
   * means this day's shifts (if any) are estimated from the recurring
   * template, not an actually-generated week. */
  weekStatus: "published" | "draft" | "projected";
  shifts: EmployeeScheduleShift[];
}

export interface EmployeeScheduleData {
  employeeId: number;
  employeeName: string;
  monthAnchor: string;
  monthLabel: string;
  weeks: EmployeeScheduleDay[][];
}

/** The "zoom in on one person" view (2026-08-11, Oliver) — a calendar
 * month showing just this employee's shifts, position, and period per
 * day. Deliberately built as reusable infrastructure: it's what a
 * manager uses to look someone up today, and it's the same shape
 * staff will eventually want for their own "My Schedule" page — same
 * projected-vs-actual blending as loadMonthOverview, just filtered
 * down to one person. */
export async function loadEmployeeSchedule(employeeId: number, monthAnchor: string): Promise<EmployeeScheduleData> {
  const [employee] = await db.select({ name: employees.nickname }).from(employees).where(eq(employees.id, employeeId));
  const employeeName = employee?.name ?? "Unknown";

  const firstOfMonth = monthStart(monthAnchor);
  const lastOfMonth = addDays(shiftMonth(monthAnchor, 1), -1);

  const gridStart = addDays(firstOfMonth, -dayOfWeek(firstOfMonth));
  const gridEnd = addDays(lastOfMonth, 6 - dayOfWeek(lastOfMonth));

  const allDates: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) allDates.push(d);

  const weekStarts = Array.from(new Set(allDates.map((d) => weekStartFor(d))));

  const [existingWeeks, templateRows, allPositions] = await Promise.all([
    db.select().from(scheduleWeeks).where(inArray(scheduleWeeks.weekStartDate, weekStarts)),
    db
      .select()
      .from(employeeScheduleTemplates)
      .where(and(eq(employeeScheduleTemplates.employeeId, employeeId), eq(employeeScheduleTemplates.active, true))),
    db.select({ id: positions.id, name: positions.name }).from(positions),
  ]);

  const positionNameById = new Map(allPositions.map((p) => [p.id, p.name]));
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
            isExtraCoverage: plannedShiftAssignments.isExtraCoverage,
          })
          .from(plannedShiftAssignments)
          .where(
            and(
              eq(plannedShiftAssignments.employeeId, employeeId),
              inArray(plannedShiftAssignments.weekId, generatedWeekIds)
            )
          )
      : [];

  const shiftsByDate = new Map<string, EmployeeScheduleShift[]>();
  function addShift(date: string, positionId: number, period: "Lunch" | "Dinner", isExtraCoverage: boolean) {
    const shift: EmployeeScheduleShift = {
      positionId,
      positionName: positionNameById.get(positionId) ?? "?",
      period,
      isExtraCoverage,
    };
    const existing = shiftsByDate.get(date);
    if (existing) existing.push(shift);
    else shiftsByDate.set(date, [shift]);
  }

  for (const a of actualAssignments) {
    addShift(a.date, a.positionId, a.period as "Lunch" | "Dinner", a.isExtraCoverage);
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
    for (const p of projected) addShift(p.date, p.positionId, p.period, false);
  }

  const weeks: EmployeeScheduleDay[][] = [];
  for (let i = 0; i < allDates.length; i += 7) {
    weeks.push(
      allDates.slice(i, i + 7).map((date) => {
        const weekStart = weekStartFor(date);
        const existing = weekByStart.get(weekStart);
        const weekStatus: EmployeeScheduleDay["weekStatus"] = existing
          ? (existing.status as "draft" | "published")
          : "projected";

        return {
          date,
          inMonth: date >= firstOfMonth && date <= lastOfMonth,
          weekStatus,
          shifts: (shiftsByDate.get(date) ?? []).sort((a, b) => (a.period === b.period ? 0 : a.period === "Lunch" ? -1 : 1)),
        };
      })
    );
  }

  return { employeeId, employeeName, monthAnchor, monthLabel: monthLabel(monthAnchor), weeks };
}
