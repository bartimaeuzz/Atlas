import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeScheduleTemplates, employees, employeePositions, positions } from "@/db/schema";

export interface TemplateCell {
  templateId: number;
  dayOfWeek: number; // 0-6, Sun-Sat
  period: "Lunch" | "Dinner";
}

export interface AssignedEmployeeGroup {
  employeeId: number;
  employeeName: string;
  cells: TemplateCell[];
  vacancyReason: "RESIGNATION" | "PROMOTION" | "OTHER" | null;
  vacancyStartsOn: string | null;
  /** Slots this person already holds in a DIFFERENT position, keyed
   * "dayOfWeek-period" → that position's name (2026-08-31, Oliver's
   * Aey-is-already-Manager-on-Monday case). The grid disables those
   * checkboxes with the position named; the server refuses regardless. */
  slotsHeldElsewhere: Record<string, string>;
}

export interface PositionTemplateGroup {
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  /** slotsHeldElsewhere rides along so a person picked via "+ Add a
   * person" — whose row exists only client-side until the first save —
   * still gets their taken slots disabled (2026-08-31; this exact gap
   * was Oliver's repro: add Aey to Host, Monday was tickable even
   * though she's Manager on Monday). */
  eligibleEmployees: { id: number; name: string; slotsHeldElsewhere: Record<string, string> }[];
  assignedEmployees: AssignedEmployeeGroup[];
}

/** Powers the 2026-08-12 redesign of /schedule/templates: Position ->
 * dropdown-pick-a-person -> Monday-Sunday x Lunch/Dinner checkbox grid,
 * replacing the old one-row-at-a-time list (see loadScheduleTemplates.ts,
 * now unused — kept only in case something else ever needs the flat
 * shape again). Oliver's reasoning: a position like Server normally has
 * 3+ people each with their own weekly pattern, and adding each
 * day/period as a separate form submission was slow — checking boxes for
 * one person's whole week at once is faster. Supersedes
 * loadScheduleTemplates.ts (retired to loadScheduleTemplates.ts.stale —
 * see .gitignore's *.stale note for why files here get renamed instead
 * of deleted).
 *
 * "Eligible" employees are the same list AddTemplateForm used to grey-in:
 * whoever's actually assigned to this position from Employee admin
 * (employeePositions + primaryPositionId), not every active employee —
 * keeps the per-position dropdown short and relevant. */
export async function loadTemplatesByPosition(): Promise<PositionTemplateGroup[]> {
  const activePositions = await db.select().from(positions).where(eq(positions.active, true));
  if (activePositions.length === 0) return [];

  const activeEmployees = await db.select().from(employees).where(eq(employees.active, true));
  const employeeIds = activeEmployees.map((e) => e.id);

  const positionRows =
    employeeIds.length > 0
      ? await db.select().from(employeePositions).where(inArray(employeePositions.employeeId, employeeIds))
      : [];

  // employeeId -> assigned positionId set, same backfill as
  // loadEmployeeAssignedPositionIds (primaryPositionId always counts).
  const assignedPositionIdsByEmployee = new Map<number, Set<number>>();
  for (const e of activeEmployees) {
    const set = new Set(positionRows.filter((r) => r.employeeId === e.id).map((r) => r.positionId));
    if (e.primaryPositionId !== null) set.add(e.primaryPositionId);
    assignedPositionIdsByEmployee.set(e.id, set);
  }

  const templateRows = await db
    .select({
      id: employeeScheduleTemplates.id,
      employeeId: employeeScheduleTemplates.employeeId,
      employeeName: employees.nickname,
      positionId: employeeScheduleTemplates.positionId,
      dayOfWeek: employeeScheduleTemplates.dayOfWeek,
      period: employeeScheduleTemplates.period,
      vacancyReason: employeeScheduleTemplates.vacancyReason,
      vacancyStartsOn: employeeScheduleTemplates.vacancyStartsOn,
    })
    .from(employeeScheduleTemplates)
    .innerJoin(employees, eq(employeeScheduleTemplates.employeeId, employees.id))
    .where(eq(employeeScheduleTemplates.active, true));

  const positionNameById = new Map(activePositions.map((p) => [p.id, p.name]));
  // employeeId -> every active template slot they hold, with position —
  // feeds slotsHeldElsewhere per group below.
  const slotsByEmployee = new Map<number, { key: string; positionId: number; positionName: string }[]>();
  for (const r of templateRows) {
    const list = slotsByEmployee.get(r.employeeId) ?? [];
    list.push({
      key: `${r.dayOfWeek}-${r.period}`,
      positionId: r.positionId,
      positionName: positionNameById.get(r.positionId) ?? "another position",
    });
    slotsByEmployee.set(r.employeeId, list);
  }
  const slotsHeldElsewhereFor = (employeeId: number, positionId: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const s of slotsByEmployee.get(employeeId) ?? []) {
      if (s.positionId !== positionId) out[s.key] = s.positionName;
    }
    return out;
  };

  return activePositions
    .map((p) => {
      const eligibleEmployees = activeEmployees
        .filter((e) => assignedPositionIdsByEmployee.get(e.id)?.has(p.id))
        .map((e) => ({ id: e.id, name: e.nickname, slotsHeldElsewhere: slotsHeldElsewhereFor(e.id, p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const rowsForPosition = templateRows.filter((r) => r.positionId === p.id);
      const byEmployee = new Map<number, AssignedEmployeeGroup>();
      for (const r of rowsForPosition) {
        let group = byEmployee.get(r.employeeId);
        if (!group) {
          group = {
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            cells: [],
            vacancyReason: r.vacancyReason as "RESIGNATION" | "PROMOTION" | "OTHER" | null,
            vacancyStartsOn: r.vacancyStartsOn,
            slotsHeldElsewhere: slotsHeldElsewhereFor(r.employeeId, p.id),
          };
          byEmployee.set(r.employeeId, group);
        }
        group.cells.push({ templateId: r.id, dayOfWeek: r.dayOfWeek, period: r.period as "Lunch" | "Dinner" });
      }

      const assignedEmployees = Array.from(byEmployee.values()).sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName)
      );

      return {
        positionId: p.id,
        positionName: p.name,
        positionCategory: p.category as "FOH" | "BOH",
        eligibleEmployees,
        assignedEmployees,
      };
    })
    .sort((a, b) =>
      a.positionCategory === b.positionCategory
        ? a.positionName.localeCompare(b.positionName)
        : a.positionCategory === "FOH"
          ? -1
          : 1
    );
}
