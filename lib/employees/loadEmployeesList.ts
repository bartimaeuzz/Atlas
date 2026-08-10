import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeePositions, employeeWageRates, positions } from "@/db/schema";

export interface EmployeePositionRow {
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  tipPointValue: number;
}

export interface EmployeeWageRateRow {
  positionId: number;
  positionName: string;
  period: "Lunch" | "Dinner";
  rate: number;
}

export interface EmployeeListRow {
  id: number;
  name: string;
  active: boolean;
  hireDate: string | null;
  primaryPositionId: number | null;
  primaryPositionName: string | null;
  systemRole: "STAFF" | "MANAGER" | "ADMIN";
  positions: EmployeePositionRow[];
  wageRates: EmployeeWageRateRow[];
  /** Whether a staff-login PIN has been set (2026-08-10) — never expose
   * the actual pinHash to a loader/page, just this boolean, so the edit
   * page can show "Set PIN" vs "Reset PIN" without the hash ever leaving
   * the server. */
  hasPinSet: boolean;
}

/** Powers the /employees list + edit form — same shape as
 * loadPositionsList/loadPositionForEdit: one function for the list, one
 * for a single record, both joining in the child rows (here:
 * employeePositions for standing tip point values, employeeWageRates for
 * BOH's per-employee wage — see EmployeeForm.tsx for why BOH wage lives
 * here and not on the Position page). */
/** Defensive fix (2026-08-10): some seeded employees (Bomb, Papi) have a
 * `primaryPositionId` and wage-rate history but no matching
 * `employeePositions` row — a latent seed-data gap from when that table
 * was originally scoped as "FOH only" (see its schema comment). Left
 * alone, the Employee edit form would render their primary position as
 * unchecked ("— none —" in the select, since the option wouldn't even be
 * offered), and saving would silently wipe their wage rate. Fixed at read
 * time: always treat primaryPositionId as assigned, synthesizing a row
 * with the position's default tip point value if a real one doesn't
 * exist yet. Saving the form for real then creates the missing row,
 * closing the gap permanently for that employee. */
function ensurePrimaryPositionIncluded(
  positionsList: EmployeePositionRow[],
  primaryPositionId: number | null,
  positionById: Map<number, { id: number; name: string; category: string; defaultTipPointValue: number | null }>
): EmployeePositionRow[] {
  if (primaryPositionId === null) return positionsList;
  if (positionsList.some((p) => p.positionId === primaryPositionId)) return positionsList;

  const p = positionById.get(primaryPositionId);
  if (!p) return positionsList;

  return [
    ...positionsList,
    {
      positionId: p.id,
      positionName: p.name,
      positionCategory: p.category as "FOH" | "BOH",
      tipPointValue: p.defaultTipPointValue ?? 1.0,
    },
  ];
}

export async function loadEmployeesList(): Promise<EmployeeListRow[]> {
  const allEmployees = await db.select().from(employees);
  if (allEmployees.length === 0) return [];

  const employeeIds = allEmployees.map((e) => e.id);
  const allPositions = await db.select().from(positions);
  const positionById = new Map(allPositions.map((p) => [p.id, p]));

  const positionRows = await db
    .select()
    .from(employeePositions)
    .where(inArray(employeePositions.employeeId, employeeIds));

  const wageRows = await db
    .select()
    .from(employeeWageRates)
    .where(inArray(employeeWageRates.employeeId, employeeIds));

  return allEmployees
    .map((e) => ({
      id: e.id,
      name: e.name,
      active: e.active,
      hireDate: e.hireDate,
      primaryPositionId: e.primaryPositionId,
      primaryPositionName: e.primaryPositionId ? positionById.get(e.primaryPositionId)?.name ?? null : null,
      systemRole: e.systemRole as "STAFF" | "MANAGER" | "ADMIN",
      hasPinSet: e.pinHash !== null,
      positions: ensurePrimaryPositionIncluded(
        positionRows
          .filter((r) => r.employeeId === e.id)
          .map((r) => {
            const p = positionById.get(r.positionId);
            return {
              positionId: r.positionId,
              positionName: p?.name ?? "(unknown)",
              positionCategory: (p?.category ?? "FOH") as "FOH" | "BOH",
              tipPointValue: r.tipPointValue,
            };
          }),
        e.primaryPositionId,
        positionById
      ),
      wageRates: wageRows
        .filter((r) => r.employeeId === e.id)
        .map((r) => ({
          positionId: r.positionId,
          positionName: positionById.get(r.positionId)?.name ?? "(unknown)",
          period: r.period as "Lunch" | "Dinner",
          rate: r.rate,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadEmployeeForEdit(employeeId: number): Promise<EmployeeListRow | null> {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee) return null;

  const allPositions = await db.select().from(positions);
  const positionById = new Map(allPositions.map((p) => [p.id, p]));

  const positionRows = await db.select().from(employeePositions).where(eq(employeePositions.employeeId, employeeId));
  const wageRows = await db.select().from(employeeWageRates).where(eq(employeeWageRates.employeeId, employeeId));

  return {
    id: employee.id,
    name: employee.name,
    active: employee.active,
    hireDate: employee.hireDate,
    primaryPositionId: employee.primaryPositionId,
    primaryPositionName: employee.primaryPositionId ? positionById.get(employee.primaryPositionId)?.name ?? null : null,
    systemRole: employee.systemRole as "STAFF" | "MANAGER" | "ADMIN",
    hasPinSet: employee.pinHash !== null,
    positions: ensurePrimaryPositionIncluded(
      positionRows.map((r) => {
        const p = positionById.get(r.positionId);
        return {
          positionId: r.positionId,
          positionName: p?.name ?? "(unknown)",
          positionCategory: (p?.category ?? "FOH") as "FOH" | "BOH",
          tipPointValue: r.tipPointValue,
        };
      }),
      employee.primaryPositionId,
      positionById
    ),
    wageRates: wageRows.map((r) => ({
      positionId: r.positionId,
      positionName: positionById.get(r.positionId)?.name ?? "(unknown)",
      period: r.period as "Lunch" | "Dinner",
      rate: r.rate,
    })),
  };
}

export interface AssignablePosition {
  id: number;
  name: string;
  category: "FOH" | "BOH";
  active: boolean;
  defaultTipPointValue: number | null;
}

/** All positions, active AND retired, for the assignment checklist on the
 * employee form. Retired positions still need to show (labeled) so
 * editing an existing employee doesn't silently drop them from a
 * position they historically hold — same reasoning as the roster page
 * keeping historical entries valid after a position is retired. */
export async function loadAllPositionsForAssignment(): Promise<AssignablePosition[]> {
  const rows = await db.select().from(positions);
  return rows
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category as "FOH" | "BOH",
      active: p.active,
      defaultTipPointValue: p.defaultTipPointValue,
    }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));
}

/** Lean employeeId -> assigned positionId[] lookup, for the roster page's
 * "Add someone" dropdown (2026-08-10, Oliver: the position dropdown
 * should reflect who's actually assigned to what from Employee admin,
 * not show every position flat for everyone). Reuses the same defensive
 * backfill as loadEmployeesList — a primaryPositionId always counts as
 * assigned, even if the employeePositions row hasn't been created yet
 * (see ensurePrimaryPositionIncluded's comment for why). Deliberately NOT
 * used to restrict what CAN be selected — Roster's "Add someone" form
 * greys out non-assigned positions but keeps them choosable, same
 * flexibility reasoning as the multi-role confirm dialog. */
export async function loadEmployeeAssignedPositionIds(): Promise<Record<number, number[]>> {
  const allEmployees = await db.select().from(employees);
  if (allEmployees.length === 0) return {};

  const employeeIds = allEmployees.map((e) => e.id);
  const positionRows = await db
    .select()
    .from(employeePositions)
    .where(inArray(employeePositions.employeeId, employeeIds));

  const result: Record<number, number[]> = {};
  for (const e of allEmployees) {
    const assigned = new Set(positionRows.filter((r) => r.employeeId === e.id).map((r) => r.positionId));
    if (e.primaryPositionId !== null) assigned.add(e.primaryPositionId);
    result[e.id] = Array.from(assigned);
  }
  return result;
}
