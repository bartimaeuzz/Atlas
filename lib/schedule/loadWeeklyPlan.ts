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

export interface PlannedAssignmentRow {
  id: number;
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  date: string;
  period: "Lunch" | "Dinner";
  sourceType: "FROM_TEMPLATE" | "MANUAL_ADD";
  isExtraCoverage: boolean;
  /** Set when this employee's recurring slot for this exact
   * position/day-of-week/period is marked vacating (resignation or
   * promotion) AND this assignment's date is still before that vacancy
   * takes effect — i.e. they're in the grace period. null otherwise.
   * Drawn from employeeScheduleTemplates.vacancyReason/vacancyStartsOn,
   * not a separate flag on the assignment itself. */
  vacatingSoon: { reason: "RESIGNATION" | "PROMOTION" | "OTHER"; startsOn: string } | null;
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
      employeeName: employees.name,
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

  const assignments: PlannedAssignmentRow[] = rows.map((r) => {
    const vacancy = vacancyByKey.get(`${r.employeeId}:${r.positionId}:${dayOfWeek(r.date)}:${r.period}`);
    return {
      ...r,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      period: r.period as "Lunch" | "Dinner",
      sourceType: r.sourceType as "FROM_TEMPLATE" | "MANUAL_ADD",
      vacatingSoon: vacancy && r.date < vacancy.startsOn ? vacancy : null,
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
