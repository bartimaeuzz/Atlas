/**
 * Pure computation for "Save & Finalize" on the closing report. Takes the
 * already-persisted roster + sales inputs for one shift and produces the
 * exact rows to write into TipPoolCalculation + EmployeePayout — kept
 * separate from the DB-touching server action so this stays unit-testable
 * without a database, same pattern as tipPool.ts and visibility.ts.
 *
 * Host cocktail/mocktail drink bonus is wired in via the `hostDrinkBonus`
 * input (2026-08-09) — the caller resolves it from the generic metrics
 * engine (metricValues for host_qualifying_drink_count x
 * RestaurantSettings.hostDrinkBonusPerDrinkAmount), this function just
 * hands it straight to calculateTwoPoolTips like the playground calculator
 * always did. Per-employee amounts are written to EmployeePayout.hostUpsellTipShare
 * (an existing but previously-unused column — see the schema memory's note
 * on the old, mismatched HostUpsellTipRecord table; that table is unrelated
 * dead code, not what feeds this).
 */

import {
  calculateTwoPoolTips, round2,
  type HostDrinkBonusInput, type PoolRosterEntry, type PoolSplitMethod,
} from "./tipPool";

export type TipPoolGroup = "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY";

export interface FinalizeRosterRow {
  employeeId: number;
  /** Which tip pool(s) this roster row's position participates in — a
   * position (e.g. Host) can belong to more than one pool, so a single row
   * can contribute to multiple pool shares. Empty = no tip pool. */
  tipPoolGroups: TipPoolGroup[];
  pointValue: number;
  /** Per-pool point values (2026-08-25): a Host in Pool 1 + Pool 2 can
   * now weigh differently in each. Missing entries fall back to
   * pointValue, so existing callers and data behave exactly as before. */
  pointValueByPool?: Partial<Record<TipPoolGroup, number>>;
  /** Flat wage for THIS row, or null if not the wage-bearing row for this
   * employee this shift (same one-row-per-employee rule as loadRosterForCalc). */
  flatWage: number | null;
}

/** Optional per-employee wage adjustment for shift-coverage situations
 * (added 2026-08-10, e.g. Erika works Host but covers Aey's Bartender
 * shift when Aey calls in sick). overrideAmount, if set, REPLACES the
 * auto-resolved flat wage entirely; extraPayAmount is ALWAYS additive on
 * top of whichever wage applies, shown as its own separate payout line.
 * deductionAmount (added 2026-08-10, later same day) is ALWAYS subtractive
 * from totalCorePayout, for disciplinary/correction deductions — its own
 * separate line, never netted into flatWageAmount. Optional (defaults to
 * 0 via `?? 0` at the call site) so every existing caller/test that only
 * knows about override+extraPay keeps compiling unchanged. */
export interface WageAdjustment {
  overrideAmount: number | null;
  extraPayAmount: number;
  deductionAmount?: number;
}

export interface FinalizeShiftInput {
  deductionRate: number;
  grossCcTip: number;
  takeoutCcTip: number;
  cashTip: number; // pooled into Pool 1, no deduction (2026-08-10)
  deliveryToastTip: number;
  hostDrinkBonus: HostDrinkBonusInput | null;
  platformCourierTips: number;
  platformDeliveryTips: number;
  pool1SplitMethod: PoolSplitMethod;
  pool2SplitMethod: PoolSplitMethod;
  pool3SplitMethod: PoolSplitMethod;
  roster: FinalizeRosterRow[];
  /** Keyed by employeeId. Employees with no entry get their normal
   * auto-resolved wage and no extra pay — this param is entirely optional. */
  wageAdjustments: Record<number, WageAdjustment>;
  /** Keyed by employeeId — sum of every fired IncentiveRule payout for
   * that employee this shift (2026-08-10, see lib/calc/incentiveRules.ts).
   * Resolved by the caller (computeFinalizationPreview.ts) since it needs
   * the full rule/condition/target set from the DB; this function just
   * adds the already-computed total onto the payout, same pattern as
   * hostDrinkBonus. Employees with no entry get 0. */
  incentiveAmounts: Record<number, number>;
}

export interface FinalizeEmployeePayout {
  employeeId: number;
  pointValueUsed: number | null;
  /** Sum of pool1Share + pool2Share + pool3Share — kept for anything that
   * only needs the combined total. */
  tipPoolShare: number;
  pool1Share: number;
  pool2Share: number;
  pool3Share: number;
  flatWageAmount: number;
  /** Host cocktail/mocktail drink bonus for this employee, 0 if none. Paid
   * on top of (not instead of) their normal Pool 1 point-weighted share —
   * it's already been pulled off the top of Pool 1 before that split runs,
   * so this is purely additive here, no double-counting. Field name matches
   * the existing (previously-unused) EmployeePayout.hostUpsellTipShare
   * column so lib/actions/shift.ts can keep writing this via a plain
   * object spread — see the header comment for the naming note. */
  hostUpsellTipShare: number;
  /** Ad hoc extra pay for this shift (e.g. covering another role), always
   * additive on top of flatWageAmount — shown as its own separate line,
   * never silently folded into "their normal wage." 0 if none. */
  extraPayAmount: number;
  /** tipPoolShare + hostUpsellTipShare — every dollar that's a TIP, as
   * opposed to wage or extra pay. Added 2026-08-10 so the payout table can
   * show "how much did I make in tips today" as its own number, distinct
   * from the grand total which also includes wage. */
  totalTip: number;
  /** Sum of every fired IncentiveRule payout for this employee this shift
   * (2026-08-10 — the $10k-total-sales BOH flat bonus is the first
   * concrete rule using this). 0 if no rule fired for them. Shown as its
   * own separate line, same house style as extraPayAmount/hostUpsellTipShare
   * — never silently folded into another figure. */
  incentiveAmount: number;
  /** Disciplinary/correction deduction for this shift (2026-08-10), e.g.
   * late arrival or property damage — ALWAYS subtracted in totalCorePayout,
   * shown as its own separate line, never netted silently into
   * flatWageAmount. 0 if none. Visibility is enforced by callers, not
   * here: shown to the employee + managers (Preview/Summary, My Pay's own
   * payout block), never on My Pay's "Also worked this shift" coworker
   * list — see shiftWageAdjustments' schema comment for the full reasoning. */
  deductionAmount: number;
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
    deductionRate, grossCcTip, takeoutCcTip, cashTip, deliveryToastTip, hostDrinkBonus,
    platformCourierTips, platformDeliveryTips,
    pool1SplitMethod, pool2SplitMethod, pool3SplitMethod, roster, wageAdjustments,
    incentiveAmounts,
  } = input;

  const poolPoint = (r: FinalizeRosterRow, pool: TipPoolGroup) => r.pointValueByPool?.[pool] ?? r.pointValue;
  const pool1Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_1_DINE_IN"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: poolPoint(r, "POOL_1_DINE_IN") }));
  const pool2Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_2_TAKEOUT_ONLINE"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: poolPoint(r, "POOL_2_TAKEOUT_ONLINE") }));
  const pool3Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_3_DELIVERY"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: poolPoint(r, "POOL_3_DELIVERY") }));

  const calc = calculateTwoPoolTips({
    deductionRate,
    grossCcTip,
    takeoutCcTip,
    cashTip,
    hostDrinkBonus,
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

  // Kept per-pool (2026-08-10) rather than pre-summed — Oliver wanted the
  // Preview/Summary payout table to be able to show Pool 1/2/3 as separate
  // columns, not just one combined "tip pool share" figure. tipPoolShare
  // below is still the sum of all three, kept for backward compatibility
  // with anything that only cares about the total.
  const pool1ShareByEmployee = calc.pool1.shareByEmployee;
  const pool2ShareByEmployee = calc.pool2.shareByEmployee;
  const pool3ShareByEmployee = calc.pool3.shareByEmployee;

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
    // Only a single unambiguous number is recorded: one tip-pool row AND
    // the same value in every pool it belongs to -- per-pool values that
    // differ have no honest single summary, so null (2026-08-25).
    const pointValueUsed =
      tipPoolRows.length === 1 &&
      tipPoolRows[0].tipPoolGroups.every(
        (g) => (tipPoolRows[0].pointValueByPool?.[g] ?? tipPoolRows[0].pointValue) === tipPoolRows[0].pointValue
      )
        ? tipPoolRows[0].pointValue
        : null;
    const wageRow = rowsForEmployee.find((r) => r.flatWage != null);
    const autoResolvedWage = wageRow?.flatWage ?? 0;
    const adjustment = wageAdjustments[employeeId];
    // Override REPLACES the auto-resolved wage entirely; extra pay is
    // ALWAYS additive on top, regardless of whether an override was used.
    const flatWageAmount = adjustment?.overrideAmount ?? autoResolvedWage;
    const extraPayAmount = adjustment?.extraPayAmount ?? 0;
    const deductionAmount = adjustment?.deductionAmount ?? 0;
    const pool1Share = pool1ShareByEmployee[employeeId] ?? 0;
    const pool2Share = pool2ShareByEmployee[employeeId] ?? 0;
    const pool3Share = pool3ShareByEmployee[employeeId] ?? 0;
    const tipPoolShare = round2(pool1Share + pool2Share + pool3Share);
    const hostUpsellTipShare = calc.hostDrinkBonusByEmployee[employeeId] ?? 0;
    const totalTip = round2(tipPoolShare + hostUpsellTipShare);
    const incentiveAmount = round2(incentiveAmounts[employeeId] ?? 0);
    return {
      employeeId,
      pointValueUsed,
      tipPoolShare,
      pool1Share,
      pool2Share,
      pool3Share,
      flatWageAmount,
      hostUpsellTipShare,
      extraPayAmount,
      totalTip,
      incentiveAmount,
      deductionAmount,
      totalCorePayout: round2(
        tipPoolShare + flatWageAmount + hostUpsellTipShare + extraPayAmount + incentiveAmount - deductionAmount
      ),
    };
  });

  return {
    tipPoolCalculation: {
      grossCcTip: round2(grossCcTip),
      deductionRate,
      netCcTip: round2(grossCcTip * (1 - deductionRate)),
      // "HostUpsellTip" here means the host drink bonus (naming predates
      // this being wired in) — no separate deduction applies to it beyond
      // the deduction already baked into Pool 1 before the bonus is pulled
      // off the top, so total and net are the same figure.
      totalHostUpsellTip: calc.pool1.totalHostDrinkBonus,
      netHostUpsellTip: calc.pool1.totalHostDrinkBonus,
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
