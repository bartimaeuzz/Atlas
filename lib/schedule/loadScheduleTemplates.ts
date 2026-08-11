import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeScheduleTemplates, employees, positions } from "@/db/schema";

export interface ScheduleTemplateRow {
  id: number;
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  dayOfWeek: number; // 0-6, Sun-Sat
  period: "Lunch" | "Dinner";
  effectiveFrom: string | null;
  vacancyReason: "RESIGNATION" | "PROMOTION" | "OTHER" | null;
  vacancyStartsOn: string | null;
}

/** Powers /schedule/templates — every ACTIVE recurring template
 * assignment ("Employee X normally works Position Y, this day, this
 * period"), joined with employee/position names so the list is legible
 * without extra lookups. Retired rows (active=false) are excluded, same
 * "active only" convention as loadPositionsList/loadEmployeesList —
 * unlike those pages, there's no need to show retired template rows
 * inline here since (unlike a Position or Employee) a retired template
 * row has no historical data hanging off it that needs the row to stay
 * visible; the replacement row is what matters going forward. */
export async function loadScheduleTemplates(): Promise<ScheduleTemplateRow[]> {
  const rows = await db
    .select({
      id: employeeScheduleTemplates.id,
      employeeId: employeeScheduleTemplates.employeeId,
      employeeName: employees.name,
      positionId: employeeScheduleTemplates.positionId,
      positionName: positions.name,
      positionCategory: positions.category,
      dayOfWeek: employeeScheduleTemplates.dayOfWeek,
      period: employeeScheduleTemplates.period,
      effectiveFrom: employeeScheduleTemplates.effectiveFrom,
      vacancyReason: employeeScheduleTemplates.vacancyReason,
      vacancyStartsOn: employeeScheduleTemplates.vacancyStartsOn,
    })
    .from(employeeScheduleTemplates)
    .innerJoin(employees, eq(employeeScheduleTemplates.employeeId, employees.id))
    .innerJoin(positions, eq(employeeScheduleTemplates.positionId, positions.id))
    .where(eq(employeeScheduleTemplates.active, true));

  return rows
    .map((r) => ({
      ...r,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      period: r.period as "Lunch" | "Dinner",
      vacancyReason: r.vacancyReason as "RESIGNATION" | "PROMOTION" | "OTHER" | null,
    }))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      if (a.period !== b.period) return a.period === "Lunch" ? -1 : 1;
      if (a.positionCategory !== b.positionCategory) return a.positionCategory === "FOH" ? -1 : 1;
      return a.positionName.localeCompare(b.positionName);
    });
}
