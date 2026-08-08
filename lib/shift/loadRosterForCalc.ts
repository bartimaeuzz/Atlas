import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftRosterEntries, employees, positions, employeePositions, shiftSales,
  positionShiftRates, employeeWageRates, positionTipPools,
} from "@/db/schema";
import { calculateFlatWage } from "@/lib/calc/flatWage";

export type TipPoolGroup = "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY";

export interface RosterRow {
  rosterEntryId: number;
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  /** Which tip pool(s) this position participates in — a position (e.g.
   * Host) can be in more than one, so this is an array now, not a single
   * value. Empty array = no tip pool (Manager, Chef, ...). */
  tipPoolGroups: TipPoolGroup[];
  pointValue: number; // resolved: override -> EmployeePosition -> 1.0 fallback
  /** Flat wage for THIS row, or null if this employee's wage is already
   * counted on another row this shift (see loadShiftCalcData doc). */
  flatWage: number | null;
  wageNote: string | null;
}

export interface ShiftCalcData {
  shift: { id: number; date: string; period: string; status: string } | null;
  sales: { ccTipTotal: number; totalSales: number } | null;
  roster: RosterRow[];
}

/** Loads everything the tip-pool calculator UI needs for one shift, with
 * each roster entry's point value already resolved the same way the core
 * calc engine expects it (day-only override wins over the employee's
 * standing EmployeePosition value).
 *
 * Wage handling: an employee CAN still have multiple roster rows in the
 * same shift if they're genuinely working two different positions (e.g.
 * someone covering both Bartender and Runner for one shift). That's still
 * ONE physical shift worked, so the flat wage is only resolved on ONE of
 * their rows (their primaryPositionId if it's among their rows this shift,
 * else the first row) — other rows show flatWage: null with a note, so the
 * UI doesn't double-count pay. (Note: this used to also trigger for Host,
 * who needed two rows to cover Pool 1 + Pool 2 — that's fixed now, Host is
 * one row with two tipPoolGroups, see positionTipPools in db/schema.ts.)
 */
export async function loadShiftCalcData(shiftId: number): Promise<ShiftCalcData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));

  if (!shift) return { shift: null, sales: null, roster: [] };

  const rows = await db
    .select({
      rosterEntryId: shiftRosterEntries.id,
      employeeId: employees.id,
      employeeName: employees.name,
      primaryPositionId: employees.primaryPositionId,
      positionId: positions.id,
      positionName: positions.name,
      positionCategory: positions.category,
      pointOverride: shiftRosterEntries.pointValueOverride,
      standingPoint: employeePositions.tipPointValue,
    })
    .from(shiftRosterEntries)
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .leftJoin(
      employeePositions,
      and(
        eq(employeePositions.employeeId, shiftRosterEntries.employeeId),
        eq(employeePositions.positionId, shiftRosterEntries.positionId)
      )
    )
    .where(eq(shiftRosterEntries.shiftId, shiftId));

  const positionIds = Array.from(new Set(rows.map((r) => r.positionId)));
  const tipPoolRows = positionIds.length
    ? await db.select().from(positionTipPools).where(inArray(positionTipPools.positionId, positionIds))
    : [];
  const poolGroupsByPositionId = new Map<number, TipPoolGroup[]>();
  for (const r of tipPoolRows) {
    const list = poolGroupsByPositionId.get(r.positionId) ?? [];
    list.push(r.tipPoolGroup as TipPoolGroup);
    poolGroupsByPositionId.set(r.positionId, list);
  }

  const positionShiftRateRows = await db
    .select()
    .from(positionShiftRates)
    .where(eq(positionShiftRates.period, shift.period as "Lunch" | "Dinner"));
  const positionRateByPositionId = new Map(positionShiftRateRows.map((r) => [r.positionId, r.flatRate]));

  const employeeWageRateRows = await db
    .select()
    .from(employeeWageRates)
    .where(eq(employeeWageRates.period, shift.period as "Lunch" | "Dinner"));
  const employeeRateByKey = new Map(
    employeeWageRateRows.map((r) => [`${r.employeeId}:${r.positionId}`, r.rate])
  );

  // employee_positions has a unique(employeeId, positionId) constraint, so
  // this join is naturally 1:1 — the map is just a defensive dedupe, not load-bearing.
  const seen = new Map<number, RosterRow & { primaryPositionId: number | null }>();
  for (const r of rows) {
    if (seen.has(r.rosterEntryId)) continue;
    seen.set(r.rosterEntryId, {
      rosterEntryId: r.rosterEntryId,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      primaryPositionId: r.primaryPositionId,
      positionId: r.positionId,
      positionName: r.positionName,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      tipPoolGroups: poolGroupsByPositionId.get(r.positionId) ?? [],
      pointValue: r.pointOverride ?? r.standingPoint ?? 1.0,
      flatWage: null, // resolved below, once per employee
      wageNote: null,
    });
  }

  const allRows = Array.from(seen.values());

  // Group by employee, pick ONE row per employee to carry the wage.
  const rowsByEmployee = new Map<number, typeof allRows>();
  for (const r of allRows) {
    const list = rowsByEmployee.get(r.employeeId) ?? [];
    list.push(r);
    rowsByEmployee.set(r.employeeId, list);
  }

  for (const [, employeeRows] of rowsByEmployee) {
    const wageBearingRow =
      employeeRows.find((r) => r.positionId === r.primaryPositionId) ?? employeeRows[0];

    for (const r of employeeRows) {
      if (r !== wageBearingRow) {
        r.wageNote = `Wage counted under "${wageBearingRow.positionName}" — same shift, not paid twice`;
        continue;
      }
      if (r.positionCategory === "FOH") {
        const rate = positionRateByPositionId.get(r.positionId);
        r.flatWage = rate != null ? calculateFlatWage({ category: "FOH", positionRate: rate }) : null;
        if (rate == null) r.wageNote = "No PositionShiftRate set for this position/period";
      } else {
        const rate = employeeRateByKey.get(`${r.employeeId}:${r.positionId}`);
        r.flatWage = rate != null ? calculateFlatWage({ category: "BOH", employeeRate: rate }) : null;
        if (rate == null) r.wageNote = "No EmployeeWageRate set for this employee/position/period";
      }
    }
  }

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status },
    sales: sales ? { ccTipTotal: sales.ccTipTotal, totalSales: sales.totalSales } : null,
    roster: allRows.map(({ primaryPositionId: _drop, ...rest }) => rest),
  };
}
