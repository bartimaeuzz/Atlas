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

import { calculateTwoPoolTips, round2, type PoolRosterEntry } from "./tipPool";

export interface FinalizeRosterRow {
  employeeId: number;
  tipPoolGroup: "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY" | "NONE";
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
    platformCourierTips, platformDeliveryTips, roster,
  } = input;

  const pool1Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroup === "POOL_1_DINE_IN")
    .map((r) => ({ employeeId: r.employeeId, pointValue: r.pointValue }));
  const pool2Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroup === "POOL_2_TAKEOUT_ONLINE")
    .map((r) => ({ employeeId: r.employeeId, pointValue: r.pointValue }));
  const pool3EmployeeIds = roster
    .filter((r) => r.tipPoolGroup === "POOL_3_DELIVERY")
    .map((r) => r.employeeId);

  const calc = calculateTwoPoolTips({
    deductionRate,
    grossCcTip,
    takeoutCcTip,
    hostDrinkBonus: [],
    pool1Roster,
    platformCourierTips,
    pool2Roster,
    deliveryToastTip,
    platformDeliveryTips,
    pool3EmployeeIds,
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
    const tipPoolRows = rowsForEmployee.filter((r) => r.tipPoolGroup !== "NONE");
    // Only record a single point value if unambiguous (one tip-pool row).
    // Someone spanning two pools (e.g. Host in Pool 1 + Pool 2) doesn't have
    // one point value to report here — leave null rather than guess.
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
