import { dateForDayOfWeek } from "./weekMath";

export interface TemplateRowForProjection {
  employeeId: number;
  positionId: number;
  dayOfWeek: number;
  period: "Lunch" | "Dinner";
  effectiveFrom: string | null;
  vacancyStartsOn: string | null;
}

export interface ProjectedAssignment {
  employeeId: number;
  positionId: number;
  date: string;
  period: "Lunch" | "Dinner";
}

/** Pure function: given a week's Monday start date and the active
 * template rows, returns what `generateWeekFromTemplate` would insert
 * for that week — same effectiveFrom/vacancyStartsOn skip rules,
 * factored out (2026-08-11) so the month overview can PROJECT future
 * weeks that haven't actually been generated yet, using the exact same
 * rules as the real generate action, without either copy drifting from
 * the other or writing anything to the database. */
export function projectAssignmentsForWeek(
  weekStartDate: string,
  templateRows: TemplateRowForProjection[]
): ProjectedAssignment[] {
  const rows: ProjectedAssignment[] = [];
  for (const t of templateRows) {
    const date = dateForDayOfWeek(weekStartDate, t.dayOfWeek);
    if (t.effectiveFrom && date < t.effectiveFrom) continue;
    if (t.vacancyStartsOn && date >= t.vacancyStartsOn) continue;

    rows.push({
      employeeId: t.employeeId,
      positionId: t.positionId,
      date,
      period: t.period,
    });
  }
  return rows;
}
