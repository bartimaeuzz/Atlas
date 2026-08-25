import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  scheduleWeeks,
  plannedShiftAssignments,
  employees,
  positions,
  positionStaffingTargets,
  employeeScheduleTemplates,
} from "@/db/schema";
import { datesInWeek, dayOfWeek } from "@/lib/schedule/weekMath";
import type { StaffingTargetPosition } from "@/lib/schedule/loadStaffingTargets";
import { loadLeaveByEmployeeForRange } from "@/lib/schedule/loadLeaveRequests";
import { loadSwapStatusByAssignmentForWeek } from "@/lib/schedule/loadSwapRequests";

export interface PlannedAssignmentRow {
  id: number;
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  date: string;
  period: "Lunch" | "Dinner";
  sourceType: "FROM_TEMPLATE" | "MANUAL_ADD" | "AUTO_FILL" | "REASSIGNED";
  isExtraCoverage: boolean;
  /** Set when this employee's recurring slot for this exact
   * position/day-of-week/period is marked vacating (resignation or
   * promotion) AND this assignment's date is still before that vacancy
   * takes effect — i.e. they're in the grace period. null otherwise.
   * Drawn from employeeScheduleTemplates.vacancyReason/vacancyStartsOn,
   * not a separate flag on the assignment itself. */
  vacatingSoon: { reason: "RESIGNATION" | "PROMOTION" | "OTHER"; startsOn: string } | null;
  /** Set when this assignment's date falls inside a leave request this
   * employee logged themselves (see leaveRequests / lib/actions/leave.ts)
   * — a DERIVED flag computed here at read time, never a persisted
   * mutation to the assignment or template row. Distinct from
   * vacatingSoon: a leave is temporary (the employee is expected back on
   * their normal template once it ends), a vacancy is permanent. */
  onLeave: { note: string | null } | null;
  /** Set when this assignment currently reflects a shift swap (Schedule
   * Planner Phase E, 2026-08-16) — "completed" once reassigned,
   * "pending_manager_approval" if it's within the <=3-day approval
   * window and a manager still needs to decide. DERIVED at read time
   * from swapRequests, same convention as onLeave/vacatingSoon above.
   * requestingEmployeeName is who originally held this slot before the
   * swap (the current employeeName on this row is whoever has it now). */
  swap: { status: "pending_manager_approval" | "completed"; requestingEmployeeName: string } | null;
}

export interface WeeklyPlanData {
  weekStartDate: string;
  dates: string[]; // Monday..Sunday
  /** null = this week hasn't been generated from the template yet. */
  week: { id: number; status: "draft" | "published"; publishedAt: string | null } | null;
  assignments: PlannedAssignmentRow[];
  positions: StaffingTargetPosition[];
  /** Same sparse lookup convention as loadStaffingTargets — key
   * `${positionId}:${dayOfWeek}:${period}`, missing = target 0. */
  targets: Record<string, number>;
}

/** Powers /schedule/plan?week=YYYY-MM-DD. Returns everything the weekly
 * grid needs in one call: the week's status (or null if not generated
 * yet), every planned assignment, the active position list for grid
 * rows, and the staffing targets to compare actual headcount against so
 * an under-target slot is visible at a glance. */
export async function loadWeeklyPlan(weekStartDate: string): Promise<WeeklyPlanData> {
  const dates = datesInWeek(weekStartDate);

  const [weekRow] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.weekStartDate, weekStartDate));

  const allPositions = await db.select().from(positions);
  const activePositions = allPositions
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, category: p.category as "FOH" | "BOH" }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));

  const targetRows = await db.select().from(positionStaffingTargets);
  const targets: Record<string, number> = {};
  for (const row of targetRows) {
    targets[`${row.positionId}:${row.dayOfWeek}:${row.period}`] = row.targetCount;
  }

  if (!weekRow) {
    return { weekStartDate, dates, week: null, assignments: [], positions: activePositions, targets };
  }

  const rows = await db
    .select({
      id: plannedShiftAssignments.id,
      employeeId: plannedShiftAssignments.employeeId,
      employeeName: employees.nickname,
      positionId: plannedShiftAssignments.positionId,
      positionName: positions.name,
      positionCategory: positions.category,
      date: plannedShiftAssignments.date,
      period: plannedShiftAssignments.period,
      sourceType: plannedShiftAssignments.sourceType,
      isExtraCoverage: plannedShiftAssignments.isExtraCoverage,
    })
    .from(plannedShiftAssignments)
    .innerJoin(employees, eq(plannedShiftAssignments.employeeId, employees.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .where(eq(plannedShiftAssignments.weekId, weekRow.id));

  // employeeId:positionId:dayOfWeek:period -> vacancy info, only for
  // active template rows that actually have one set.
  const vacancyTemplateRows = await db
    .select({
      employeeId: employeeScheduleTemplates.employeeId,
      positionId: employeeScheduleTemplates.positionId,
      dayOfWeek: employeeScheduleTemplates.dayOfWeek,
      period: employeeScheduleTemplates.period,
      vacancyReason: employeeScheduleTemplates.vacancyReason,
      vacancyStartsOn: employeeScheduleTemplates.vacancyStartsOn,
    })
    .from(employeeScheduleTemplates)
    .where(eq(employeeScheduleTemplates.active, true));

  const vacancyByKey = new Map<string, { reason: "RESIGNATION" | "PROMOTION" | "OTHER"; startsOn: string }>();
  for (const t of vacancyTemplateRows) {
    if (!t.vacancyReason || !t.vacancyStartsOn) continue;
    vacancyByKey.set(
      `${t.employeeId}:${t.positionId}:${t.dayOfWeek}:${t.period}`,
      { reason: t.vacancyReason, startsOn: t.vacancyStartsOn }
    );
  }

  const leaveByEmployee = await loadLeaveByEmployeeForRange(dates[0], dates[dates.length - 1]);
  const swapByAssignment = await loadSwapStatusByAssignmentForWeek(weekRow.id);

  const assignments: PlannedAssignmentRow[] = rows.map((r) => {
    const vacancy = vacancyByKey.get(`${r.employeeId}:${r.positionId}:${dayOfWeek(r.date)}:${r.period}`);
    const leaves = leaveByEmployee.get(r.employeeId);
    const activeLeave = leaves?.find((l) => r.date >= l.startDate && r.date <= l.endDate) ?? null;
    const swap = swapByAssignment.get(r.id) ?? null;
    // <= not < : an assignment that was already generated/added for the
    // exact vacancyStartsOn date should still show the warning — it's
    // still a real, currently-scheduled shift, just one the manager
    // needs to notice and handle before that day arrives. (New WEEKS
    // generated after the vacancy is set won't include this slot at all
    // — see generateWeekFromTemplate's `date >= vacancyStartsOn` skip —
    // this only affects assignments that already existed on the books.)
    return {
      ...r,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      period: r.period as "Lunch" | "Dinner",
      sourceType: r.sourceType as "FROM_TEMPLATE" | "MANUAL_ADD" | "AUTO_FILL" | "REASSIGNED",
      vacatingSoon: vacancy && r.date <= vacancy.startsOn ? vacancy : null,
      onLeave: activeLeave ? { note: activeLeave.note } : null,
      swap,
    };
  });

  return {
    weekStartDate,
    dates,
    week: { id: weekRow.id, status: weekRow.status as "draft" | "published", publishedAt: weekRow.publishedAt },
    assignments,
    positions: activePositions,
    targets,
  };
}
