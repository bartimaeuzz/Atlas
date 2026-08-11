import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shiftSales, onlinePlatformSalesRecords, restaurantSettings,
  metricDefinitions, metricValues, positionMetrics, shiftWageAdjustments,
  incentiveRules, incentiveRuleConditions, incentiveRuleTargets,
} from "@/db/schema";
import { loadShiftCalcData } from "./loadRosterForCalc";
import {
  buildFinalizationResult,
  type FinalizeRosterRow, type FinalizeShiftResult, type WageAdjustment,
} from "@/lib/calc/finalizeShift";
import type { HostDrinkBonusInput } from "@/lib/calc/tipPool";
import {
  evaluateShiftIncentiveRules,
  type IncentiveRuleDef, type IncentiveRosterEntry, type IncentiveRulePayout,
} from "@/lib/calc/incentiveRules";

export interface FinalizationPreview {
  shift: { id: number; date: string; period: string; status: string };
  sales: { totalSales: number; ccTipTotal: number; cashSales: number; cashTip: number };
  result: FinalizeShiftResult;
  employeeNames: Record<number, string>;
  /** Rule-level detail behind result.employeePayouts[].incentiveAmount —
   * which specific rule fired for whom, and for how much (2026-08-10).
   * Kept separate from the per-employee total since one employee can be
   * paid by more than one rule in the same shift. Used both for display
   * (Preview/Summary can show "which rule") and by runFinalize to write
   * the incentivePayoutRecords audit trail. */
  incentiveRulePayouts: IncentiveRulePayout[];
  /** One representative position per employee for THIS shift (2026-08-10,
   * Oliver asked for a Position column + consistent sort on the manager-
   * facing payout table, matching My Pay's coworker list). An employee
   * can have more than one roster row in a multi-role shift — same
   * "wage-bearing row wins, else the first row" convention already used
   * for wage resolution (see loadRosterForCalc.ts / loadClosingReportData.ts),
   * reused here via the same wageNote signal rather than re-deriving it. */
  positionByEmployeeId: Record<number, { positionName: string; positionCategory: "FOH" | "BOH" }>;
}

/**
 * Gathers a shift's current roster + sales + settings and runs the real
 * calc engine on them — WITHOUT writing anything to the database. This is
 * the shared "compute" half of finalizing a shift; the actual finalize
 * action (lib/actions/shift.ts) calls this and then writes the result,
 * while the Preview page (app/shifts/[id]/preview) calls this and only
 * ever displays it, so a manager can review the real numbers before
 * anything gets locked (added 2026-08-08 after Oliver pointed out that
 * "Save & Finalize" locking immediately, with no review step, meant a
 * typo could get permanently baked into a payroll record with no UI path
 * to undo it).
 *
 * Throws the same friendly validation errors as the core calc engine
 * (lib/calc/tipPool.ts) if the shift isn't ready yet (no roster, no sales,
 * or the sales figures don't add up) — callers should catch and display,
 * not let it propagate as an uncaught error.
 */
export async function computeFinalizationPreview(shiftId: number): Promise<FinalizationPreview> {
  const calcData = await loadShiftCalcData(shiftId);
  if (!calcData.shift) throw new Error("Shift not found");
  if (calcData.roster.length === 0) throw new Error("Add at least one person to the roster before saving");

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  if (!sales) throw new Error("Enter closing report sales figures before saving");

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const deductionRate = settings?.ccTipDeductionRate ?? 0;
  const pool1SplitMethod = settings?.pool1SplitMethod ?? "POINT_WEIGHTED";
  const pool2SplitMethod = settings?.pool2SplitMethod ?? "POINT_WEIGHTED";
  const pool3SplitMethod = settings?.pool3SplitMethod ?? "EQUAL_SPLIT";
  const hostDrinkBonusPerDrinkAmount = settings?.hostDrinkBonusPerDrinkAmount ?? 0;

  // Host TEAM cocktail/mocktail drink bonus — ONE shared count for the
  // whole shift (SHIFT-scope metric, corrected 2026-08-10: this was
  // originally built as a per-host count, but the real business rule is a
  // single pooled waiting-area count split equally among whoever worked
  // Host that shift). Resolved from the generic metrics engine
  // (metricValues for host_qualifying_drink_count) — not a bespoke field.
  let hostDrinkBonus: HostDrinkBonusInput | null = null;
  if (hostDrinkBonusPerDrinkAmount > 0) {
    const [hostMetric] = await db
      .select()
      .from(metricDefinitions)
      .where(eq(metricDefinitions.key, "host_qualifying_drink_count"));
    if (hostMetric) {
      const [drinkCountRow] = await db
        .select()
        .from(metricValues)
        .where(and(eq(metricValues.shiftId, shiftId), eq(metricValues.metricDefinitionId, hostMetric.id)));
      if (drinkCountRow && drinkCountRow.value > 0) {
        const eligibility = await db
          .select()
          .from(positionMetrics)
          .where(eq(positionMetrics.metricDefinitionId, hostMetric.id));
        const eligiblePositionIds = new Set(eligibility.map((e) => e.positionId));
        const recipientEmployeeIds = Array.from(
          new Set(
            calcData.roster
              .filter((r) => eligiblePositionIds.has(r.positionId))
              .map((r) => r.employeeId)
          )
        );
        if (recipientEmployeeIds.length > 0) {
          hostDrinkBonus = {
            qualifyingDrinkCount: drinkCountRow.value,
            perDrinkAmount: hostDrinkBonusPerDrinkAmount,
            recipientEmployeeIds,
          };
        }
      }
    }
  }

  const platformRecords = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const platformCourierTips = round2(sum(platformRecords.map((r) => r.tipAmountPlatformCourier)));
  const platformDeliveryTips = round2(sum(platformRecords.map((r) => r.tipAmountRestaurantDelivery)));

  const roster: FinalizeRosterRow[] = calcData.roster.map((r) => ({
    employeeId: r.employeeId,
    tipPoolGroups: r.tipPoolGroups,
    pointValue: r.pointValue,
    flatWage: r.flatWage,
  }));

  // Wage adjustments (2026-08-10) — optional per-employee override + extra
  // pay for shift-coverage situations. Keyed by employeeId for the calc
  // engine; only employees who actually have a saved adjustment appear here.
  const wageAdjustmentRecords = await db
    .select()
    .from(shiftWageAdjustments)
    .where(eq(shiftWageAdjustments.shiftId, shiftId));
  const wageAdjustments: Record<number, WageAdjustment> = {};
  for (const a of wageAdjustmentRecords) {
    wageAdjustments[a.employeeId] = {
      overrideAmount: a.wageOverrideAmount,
      extraPayAmount: a.extraPayAmount,
      deductionAmount: a.deductionAmount,
    };
  }

  // Generic Incentive Rules engine (2026-08-10) — first real evaluation,
  // scoped to SHIFT-period/FLAT/PER_TARGET_FLAT rules only (see
  // lib/calc/incentiveRules.ts header comment for what's deferred).
  // shiftMetrics only has total_sales for now (read directly off ShiftSales,
  // not the vestigial disabled metric_definitions row of the same key —
  // see db/seed.ts's comment on why that row is disabled). Extend this map
  // if a future rule needs a different SHIFT-scope metric.
  const shiftMetrics: Record<string, number> = { total_sales: sales.totalSales };

  const incentiveRosterEntries: IncentiveRosterEntry[] = calcData.roster.map((r) => ({
    employeeId: r.employeeId,
    positionId: r.positionId,
    category: r.positionCategory,
  }));

  const allRules = await db.select().from(incentiveRules).where(eq(incentiveRules.enabled, true));
  let incentiveRulePayouts: IncentiveRulePayout[] = [];
  if (allRules.length > 0) {
    const ruleIds = allRules.map((r) => r.id);
    const conditionRows = await db
      .select()
      .from(incentiveRuleConditions)
      .where(inArray(incentiveRuleConditions.ruleId, ruleIds));
    const targetRows = await db
      .select()
      .from(incentiveRuleTargets)
      .where(inArray(incentiveRuleTargets.ruleId, ruleIds));

    const ruleDefs: IncentiveRuleDef[] = allRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      evaluationPeriod: rule.evaluationPeriod,
      rewardType: rule.rewardType,
      rewardValue: rule.rewardValue,
      distributionMethod: rule.distributionMethod,
      conditions: conditionRows
        .filter((c) => c.ruleId === rule.id)
        .map((c) => ({ metricKey: c.metricKey, operator: c.operator, value: c.value, valueTo: c.valueTo })),
      targets: targetRows
        .filter((t) => t.ruleId === rule.id)
        .map((t) => ({ targetType: t.targetType, targetId: t.targetId })),
    }));

    incentiveRulePayouts = evaluateShiftIncentiveRules(ruleDefs, shiftMetrics, incentiveRosterEntries);
  }

  const incentiveAmounts: Record<number, number> = {};
  for (const payout of incentiveRulePayouts) {
    incentiveAmounts[payout.employeeId] = round2((incentiveAmounts[payout.employeeId] ?? 0) + payout.amount);
  }

  const result = buildFinalizationResult({
    deductionRate,
    grossCcTip: sales.ccTipTotal,
    takeoutCcTip: sales.takeoutCcTip,
    cashTip: sales.cashTip,
    deliveryToastTip: sales.deliveryToastTip,
    hostDrinkBonus,
    platformCourierTips,
    platformDeliveryTips,
    pool1SplitMethod,
    pool2SplitMethod,
    pool3SplitMethod,
    roster,
    wageAdjustments,
    incentiveAmounts,
  });

  const employeeNames: Record<number, string> = {};
  for (const r of calcData.roster) employeeNames[r.employeeId] = r.employeeName;

  const rosterRowsByEmployeeId = new Map<number, typeof calcData.roster>();
  for (const r of calcData.roster) {
    const list = rosterRowsByEmployeeId.get(r.employeeId) ?? [];
    list.push(r);
    rosterRowsByEmployeeId.set(r.employeeId, list);
  }
  const positionByEmployeeId: FinalizationPreview["positionByEmployeeId"] = {};
  for (const [employeeId, rows] of rosterRowsByEmployeeId) {
    const representative = rows.find((r) => !r.wageNote?.startsWith("Wage counted under")) ?? rows[0];
    positionByEmployeeId[employeeId] = {
      positionName: representative.positionName,
      positionCategory: representative.positionCategory,
    };
  }

  return {
    shift: calcData.shift,
    sales: { totalSales: sales.totalSales, ccTipTotal: sales.ccTipTotal, cashSales: sales.cashSales, cashTip: sales.cashTip },
    result,
    employeeNames,
    incentiveRulePayouts,
    positionByEmployeeId,
  };
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
