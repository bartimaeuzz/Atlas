/**
 * Pure computation for "Save & Finalize" on the closing report. Takes the
 * already-persisted roster + sales inputs for one shift and produces the
 * exact rows to write into TipPoolCalculation + EmployeePayout — kept
 * separate from the DB-touching server action so this stays unit-testable
 * without a database, same pattern as tipPool.ts and visibility.ts.
 *
 * NOTE: the host cocktail/mocktail drink bonus (see tipPool.ts's
 * HostDrinkBonusEntry) is NOT wired in here yet — it only exists in the
 * standalone playground calculator (/shifts/[id]) for now. This function
 * always passes an empty hostDrinkBonus array. Revisit once Oliver confirms
 * where that count should be captured/persisted in the real flow.
 */

import { calculateTwoPoolTips, round2, type PoolRosterEntry, type PoolSplitMethod } from "./tipPool";

export type TipPoolGroup = "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY";

export interface FinalizeRosterRow {
  employeeId: number;
  /** Which tip pool(s) this roster row's position participates in — a
   * position (e.g. Host) can belong to more than one pool, so a single row
   * can contribute to multiple pool shares. Empty = no tip pool. */
  tipPoolGroups: TipPoolGroup[];
  pointValue: number;
  /** Flat wage for THIS row, or null if not the wage-bearing row for this
   * employee this shift (same one-row-per-employee rule as loadRosterForCalc). */
  flatWage: number | null;
}

export interface FinalizeShiftInput {
  deductionRate: number;
  grossCcTip: number;
  takeoutCcTip: number;
  deliveryToastTip: number;
  platformCourierTips: number;
  platformDeliveryTips: number;
  pool1SplitMethod: PoolSplitMethod;
  pool2SplitMethod: PoolSplitMethod;
  pool3SplitMethod: PoolSplitMethod;
  roster: FinalizeRosterRow[];
}

export interface FinalizeEmployeePayout {
  employeeId: number;
  pointValueUsed: number | null;
  tipPoolShare: number;
  flatWageAmount: number;
  totalCorePayout: number;
}

export interface FinalizeShiftResult {
  tipPoolCalculation: {
    grossCcTip: number;
    deductionRate: number;
    netCcTip: number;
    totalHostUpsellTip: number;
    netHostUpsellTip: number;
    netGeneralCcTip: number;
    perRoleBreakdown: Record<string, number>;
  };
  employeePayouts: FinalizeEmployeePayout[];
}

export function buildFinalizationResult(input: FinalizeShiftInput): FinalizeShiftResult {
  const {
    deductionRate, grossCcTip, takeoutCcTip, deliveryToastTip,
    platformCourierTips, platformDeliveryTips,
    pool1SplitMethod, pool2SplitMethod, pool3SplitMethod, roster,
  } = input;

  const pool1Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_1_DINE_IN"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: r.pointValue }));
  const pool2Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_2_TAKEOUT_ONLINE"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: r.pointValue }));
  const pool3Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_3_DELIVERY"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: r.pointValue }));

  const calc = calculateTwoPoolTips({
    deductionRate,
    grossCcTip,
    takeoutCcTip,
    hostDrinkBonus: [],
    pool1Roster,
    pool1SplitMethod,
    platformCourierTips,
    pool2Roster,
    pool2SplitMethod,
    deliveryToastTip,
    platformDeliveryTips,
    pool3Roster,
    pool3SplitMethod,
  });

  const tipShareByEmployee = new Map<number, number>();
  const addShare = (id: number, amt: number) =>
    tipShareByEmployee.set(id, round2((tipShareByEmployee.get(id) ?? 0) + amt));
  for (const [id, amt] of Object.entries(calc.pool1.shareByEmployee)) addShare(Number(id), amt);
  for (const [id, amt] of Object.entries(calc.pool2.shareByEmployee)) addShare(Number(id), amt);
  for (const [id, amt] of Object.entries(calc.pool3.shareByEmployee)) addShare(Number(id), amt);

  // One payout row per unique employee on the roster — including NONE-pool
  // staff (Manager, Chef, Line Cook, ...) so their flat wage still shows up.
  const uniqueEmployeeIds = Array.from(new Set(roster.map((r) => r.employeeId)));

  const employeePayouts: FinalizeEmployeePayout[] = uniqueEmployeeIds.map((employeeId) => {
    const rowsForEmployee = roster.filter((r) => r.employeeId === employeeId);
    const tipPoolRows = rowsForEmployee.filter((r) => r.tipPoolGroups.length > 0);
    // Only record a single point value if unambiguous (one tip-pool-eligible
    // roster ROW). A row can now cover multiple pools by itself (Host is one
    // row with two tipPoolGroups), so this resolves cleanly in that case —
    // it only stays null if the employee has two SEPARATE roster rows this
    // shift (e.g. genuinely working two different positions).
    const pointValueUsed = tipPoolRows.length === 1 ? tipPoolRows[0].pointValue : null;
    const wageRow = rowsForEmployee.find((r) => r.flatWage != null);
    const flatWageAmount = wageRow?.flatWage ?? 0;
    const tipPoolShare = tipShareByEmployee.get(employeeId) ?? 0;
    return {
      employeeId,
      pointValueUsed,
      tipPoolShare,
      flatWageAmount,
      totalCorePayout: round2(tipPoolShare + flatWageAmount),
    };
  });

  return {
    tipPoolCalculation: {
      grossCcTip: round2(grossCcTip),
      deductionRate,
      netCcTip: round2(grossCcTip * (1 - deductionRate)),
      totalHostUpsellTip: 0,
      netHostUpsellTip: 0,
      netGeneralCcTip: calc.pool1.netPool1AfterHostBonus,
      perRoleBreakdown: {
        pool1: calc.pool1.netPool1AfterHostBonus,
        pool2: calc.pool2.totalPool2,
        pool3: calc.pool3.totalPool3,
      },
    },
    employeePayouts,
  };
}
