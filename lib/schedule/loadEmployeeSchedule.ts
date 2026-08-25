import { and, eq, inArray, isNotNull, ne, lte, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduleWeeks, plannedShiftAssignments, employeeScheduleTemplates, employees, positions, swapRequests, leaveRequests, shifts, shiftAttendanceMarks, shiftRosterEntries } from "@/db/schema";
import { addDays, dayOfWeek, monthLabel, monthStart, shiftMonth, weekStartFor } from "@/lib/schedule/weekMath";
import { projectAssignmentsForWeek } from "@/lib/schedule/projectTemplate";

export interface EmployeeScheduleShift {
  positionId: number;
  positionName: string;
  period: "Lunch" | "Dinner";
  isExtraCoverage: boolean;
}

/** What actually happened on the day, from shift records rather than the
 * plan (2026-08-25, Oliver's injury/no-show scenario). PRIVATE to the
 * individual: this loader serves only My Schedule (self) and the
 * manager Person page, which is exactly why the records ride here and
 * not in any shared-surface loader — the privacy rule is enforced by
 * where the data lives ("good deeds we announce" was revised same day:
 * individual-only for these too). Facts, not plans, so pages may render
 * them even on weeks that aren't published. */
export interface EmployeeDayRecord {
  period: "Lunch" | "Dinner";
  kind: "no_show" | "late" | "emergency" | "extra" | "substitute";
  positionName: string | null;
}

export interface EmployeeScheduleDay {
  date: string;
  inMonth: boolean;
  /** Same meaning as loadMonthOverview's per-day status — "projected"
   * means this day's shifts (if any) are estimated from the recurring
   * template, not an actually-generated week. */
  weekStatus: "published" | "draft" | "projected";
  shifts: EmployeeScheduleShift[];
  dayRecords: EmployeeDayRecord[];
}

/** Month totals for one person (Oliver, 2026-08-25: "person schedule …
 * shows counts planned shifts | published shifts | swapped shifts |
 * coverage shifts | leave. data will be usable somewhere else").
 * Computed here in the loader — not in the page — precisely so another
 * surface (My Schedule, payroll prep, a report) can reuse the same
 * numbers without re-deriving the definitions:
 *   - planned:   every shift on the month's calendar — generated weeks
 *                (draft + published) plus template projections.
 *   - published: the subset falling in weeks staff can already see.
 *   - swappedIn: shifts this person holds via a completed staff swap.
 *   - coverage:  shifts flagged extra-coverage (the yellow busy-day add).
 *   - leaveDays: days of the month covered by a non-denied leave request.
 * In-month days only — the calendar grid's leading/trailing spill days
 * don't count. */
export interface EmployeeScheduleStats {
  planned: number;
  published: number;
  swappedIn: number;
  coverage: number;
  leaveDays: number;
}

export interface EmployeeScheduleData {
  employeeId: number;
  employeeName: string;
  monthAnchor: string;
  monthLabel: string;
  weeks: EmployeeScheduleDay[][];
  stats: EmployeeScheduleStats;
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

  // Day-of records from actual shift data (see EmployeeDayRecord's doc):
  // attendance marks + coverage-flagged roster rows for this person,
  // bounded to the visible grid's date range in the WHERE.
  const [markRows, coverageRows] = await Promise.all([
    db
      .select({ date: shifts.date, period: shifts.period, mark: shiftAttendanceMarks.mark })
      .from(shiftAttendanceMarks)
      .innerJoin(shifts, eq(shiftAttendanceMarks.shiftId, shifts.id))
      .where(and(eq(shiftAttendanceMarks.employeeId, employeeId), gte(shifts.date, gridStart), lte(shifts.date, gridEnd))),
    db
      .select({ date: shifts.date, period: shifts.period, kind: shiftRosterEntries.coverageKind, positionId: shiftRosterEntries.positionId })
      .from(shiftRosterEntries)
      .innerJoin(shifts, eq(shiftRosterEntries.shiftId, shifts.id))
      .where(
        and(
          eq(shiftRosterEntries.employeeId, employeeId),
          isNotNull(shiftRosterEntries.coverageKind),
          gte(shifts.date, gridStart),
          lte(shifts.date, gridEnd)
        )
      ),
  ]);
  const dayRecordsByDate = new Map<string, EmployeeDayRecord[]>();
  function addDayRecord(date: string, record: EmployeeDayRecord) {
    const existing = dayRecordsByDate.get(date);
    if (existing) existing.push(record);
    else dayRecordsByDate.set(date, [record]);
  }
  for (const m of markRows) {
    addDayRecord(m.date, { period: m.period as "Lunch" | "Dinner", kind: m.mark, positionName: null });
  }
  for (const c of coverageRows) {
    if (c.kind == null) continue;
    addDayRecord(c.date, { period: c.period as "Lunch" | "Dinner", kind: c.kind, positionName: positionNameById.get(c.positionId) ?? null });
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
          dayRecords: dayRecordsByDate.get(date) ?? [],
        };
      })
    );
  }

  // ---- Month stats (see EmployeeScheduleStats doc above) ----
  const [swappedInRows, leaveRows] = await Promise.all([
    // Completed swaps this person accepted, whose slot falls in the
    // month AND is still theirs (a later manual replacement could have
    // moved it on again — then it isn't their swapped-in shift anymore).
    db
      .select({ date: plannedShiftAssignments.date })
      .from(swapRequests)
      .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
      .where(
        and(
          eq(swapRequests.status, "completed"),
          eq(swapRequests.acceptingEmployeeId, employeeId),
          eq(plannedShiftAssignments.employeeId, employeeId),
          gte(plannedShiftAssignments.date, firstOfMonth),
          lte(plannedShiftAssignments.date, lastOfMonth)
        )
      ),
    db
      .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          ne(leaveRequests.status, "denied"),
          lte(leaveRequests.startDate, lastOfMonth),
          gte(leaveRequests.endDate, firstOfMonth)
        )
      ),
  ]);

  const leaveDaySet = new Set<string>();
  for (const l of leaveRows) {
    const from = l.startDate > firstOfMonth ? l.startDate : firstOfMonth;
    const to = l.endDate < lastOfMonth ? l.endDate : lastOfMonth;
    for (let d = from; d <= to; d = addDays(d, 1)) leaveDaySet.add(d);
  }

  const stats: EmployeeScheduleStats = { planned: 0, published: 0, swappedIn: swappedInRows.length, coverage: 0, leaveDays: leaveDaySet.size };
  for (const week of weeks) {
    for (const day of week) {
      if (!day.inMonth) continue;
      stats.planned += day.shifts.length;
      if (day.weekStatus === "published") stats.published += day.shifts.length;
      stats.coverage += day.shifts.filter((s) => s.isExtraCoverage).length;
    }
  }

  return { employeeId, employeeName, monthAnchor, monthLabel: monthLabel(monthAnchor), weeks, stats };
}
