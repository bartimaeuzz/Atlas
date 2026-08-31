import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { positions, positionTipPools, positionShiftRates, employeePositions, employees } from "@/db/schema";

export type TipPoolGroup = "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY";

export interface PositionListRow {
  id: number;
  name: string;
  category: "FOH" | "BOH";
  active: boolean;
  alwaysVisibleInRoster: boolean;
  earningsHiddenFromStaff: boolean;
  defaultTipPointValue: number | null;
  tipPoolGroups: TipPoolGroup[];
  /** Lunch/Dinner flat rate, FOH positions only. Empty for BOH (their wage
   * is per-employee, set on EmployeeWageRate — no UI for that yet, see
   * PROGRESS.md open items). */
  shiftRates: { period: "Lunch" | "Dinner"; flatRate: number }[];
  /** How many CURRENT people can work this position (2026-08-31, Aey:
   * "show total staff on each position behind the title") — counts
   * active employees whose assignment row is itself active, so a
   * retired person or a revoked assignment doesn't inflate it. */
  staffCount: number;
}

/** Powers the /positions list page — every position (active and retired),
 * with pool membership and FOH rates joined in so the list is legible at a
 * glance without drilling into each edit page. */
export async function loadPositionsList(): Promise<PositionListRow[]> {
  const allPositions = await db.select().from(positions);
  if (allPositions.length === 0) return [];

  const positionIds = allPositions.map((p) => p.id);

  const poolRows = await db
    .select()
    .from(positionTipPools)
    .where(inArray(positionTipPools.positionId, positionIds));

  const rateRows = await db
    .select()
    .from(positionShiftRates)
    .where(inArray(positionShiftRates.positionId, positionIds));

  const staffRows = await db
    .select({ positionId: employeePositions.positionId })
    .from(employeePositions)
    .innerJoin(employees, eq(employees.id, employeePositions.employeeId))
    .where(and(eq(employeePositions.isActive, true), eq(employees.active, true), inArray(employeePositions.positionId, positionIds)));
  const staffCountByPosition = new Map<number, number>();
  for (const r of staffRows) staffCountByPosition.set(r.positionId, (staffCountByPosition.get(r.positionId) ?? 0) + 1);

  return allPositions
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category as "FOH" | "BOH",
      active: p.active,
      alwaysVisibleInRoster: p.alwaysVisibleInRoster,
      earningsHiddenFromStaff: p.earningsHiddenFromStaff,
      defaultTipPointValue: p.defaultTipPointValue,
      tipPoolGroups: poolRows.filter((r) => r.positionId === p.id).map((r) => r.tipPoolGroup as TipPoolGroup),
      shiftRates: rateRows
        .filter((r) => r.positionId === p.id)
        .map((r) => ({ period: r.period as "Lunch" | "Dinner", flatRate: r.flatRate })),
      staffCount: staffCountByPosition.get(p.id) ?? 0,
    }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));
}

/** Single position for the edit form, same shape as a list row (reused
 * rather than a separate type — the edit form needs exactly this data). */
export async function loadPositionForEdit(positionId: number): Promise<PositionListRow | null> {
  const [position] = await db.select().from(positions).where(eq(positions.id, positionId));
  if (!position) return null;

  const poolRows = await db.select().from(positionTipPools).where(eq(positionTipPools.positionId, positionId));
  const rateRows = await db.select().from(positionShiftRates).where(eq(positionShiftRates.positionId, positionId));

  return {
    id: position.id,
    name: position.name,
    category: position.category as "FOH" | "BOH",
    active: position.active,
    alwaysVisibleInRoster: position.alwaysVisibleInRoster,
    earningsHiddenFromStaff: position.earningsHiddenFromStaff,
    defaultTipPointValue: position.defaultTipPointValue,
    tipPoolGroups: poolRows.map((r) => r.tipPoolGroup as TipPoolGroup),
    shiftRates: rateRows.map((r) => ({ period: r.period as "Lunch" | "Dinner", flatRate: r.flatRate })),
    // The edit form never shows the count; 0 keeps the shared type honest
    // without a query the page would throw away.
    staffCount: 0,
  };
}
