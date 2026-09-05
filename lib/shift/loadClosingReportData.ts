import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords,
  metricDefinitions, positionMetrics, metricValues, shiftWageAdjustments,
  restaurantSettings, shiftRosterEntries, positions,
} from "@/db/schema";
import { loadShiftCalcData, type TipPoolGroup } from "@/lib/shift/loadRosterForCalc";
import { needsPointDecision, resolvePointWeightedPools } from "@/lib/shift/pointDecision";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export interface PlatformSalesRow {
  platformId: number;
  platformName: string;
  salesAmount: number;
  commissionFee: number;
  tipAmountPlatformPickup: number;
  tipAmountPlatformCourier: number;
  tipAmountRestaurantDelivery: number;
  /** Resolved tax: the explicit saved value if set, else a SUGGESTED value
   * (salesAmount × defaultSalesTaxRate) — see taxAmountIsAuto to tell them
   * apart. 2026-08-10, sales-tax export feature. */
  taxAmount: number;
  /** True when taxAmount above is a computed suggestion, not something a
   * manager actually entered/confirmed yet. */
  taxAmountIsAuto: boolean;
}

export interface PointValueRow {
  rosterEntryId: number;
  employeeName: string;
  positionName: string;
  tipPoolGroups: TipPoolGroup[];
  /** Per-pool resolved values (2026-08-25, Oliver: a Host's one point
   * moved their weight in Pool 1 AND Pool 2 at once -- each
   * point-weighted pool now has its own field). Keys only for pools
   * this row is in. */
  pointValueByPool: Partial<Record<TipPoolGroup, number>>;
  /** True when a per-shift override is actually saved (any pool, or the
   * legacy single column) -- keeps the collapsed Tip points card from
   * hiding a bump that is in effect (2026-08-24). */
  hasOverride: boolean;
  /** True when this person was placed in a position they hold no standing
   * point for and nobody has decided their point yet (2026-08-29) -- the
   * field renders EMPTY rather than pre-filled with the silent 1.0
   * fallback, and Save & Finalize refuses until it is filled. See
   * lib/shift/pointDecision.ts for why this is narrow. */
  needsDecision: boolean;
  /** The position's own template point, offered as a one-tap suggestion
   * beside an undecided field. Null when the position has no default set.
   * A tap is still a decision -- that is the whole difference from the
   * fallback it replaces. */
  suggestedPoint: number | null;
}

/** One "enter a number for this metric, for this person" input on the
 * closing report. Generic across whatever EMPLOYEE_SHIFT metrics exist and
 * whichever positions are eligible for them (via positionMetrics) — adding
 * a new bonus metric later means seeding data, not new page code. */
export interface MetricEntryRow {
  rosterEntryId: number;
  employeeId: number;
  employeeName: string;
  positionName: string;
  metricDefinitionId: number;
  metricKey: string;
  metricLabel: string;
  currentValue: number; // 0 if nothing saved yet
}

/** One "enter a number for this metric, for the WHOLE SHIFT" input — e.g.
 * the host team's shared drink count, split equally among however many
 * people worked Host. Only shown when at least one eligible position is
 * actually staffed this shift (no point asking for a host bonus count on
 * a shift with no host). */
export interface ShiftMetricRow {
  metricDefinitionId: number;
  metricKey: string;
  metricLabel: string;
  currentValue: number; // 0 if nothing saved yet
}

/** "Wage adjustments" section — one row per EMPLOYEE on the roster (not
 * per role/roster-row, since wage is a per-person concept even when
 * someone holds multiple roles this shift). Added 2026-08-10 for shift-
 * coverage situations (e.g. Erika works Host but covers Aey's Bartender
 * shift when Aey calls in sick) — tip pool share and the host drink bonus
 * already handle multi-role shifts correctly on their own; wage was the
 * one gap, since only one role's wage normally counts per person. */
export interface WageAdjustmentRow {
  employeeId: number;
  employeeName: string;
  /** Which role's rate the system would use automatically, for context —
   * NOT necessarily what actually gets paid if an override is entered. */
  wageBearingPositionName: string;
  /** Category of the wage-bearing role -- lets the form group rows under
   * the same Floor Manager / FOH / BOH section rows the roster uses
   * (2026-08-25, Oliver: "use consistency header card"). */
  wageBearingPositionCategory: "FOH" | "BOH";
  /** The auto-resolved wage for reference, or null if no rate is set for
   * that position/period (shown so the manager knows what they're
   * overriding, or why an override might be needed). */
  autoResolvedWage: number | null;
  wageOverrideAmount: number | null; // null = use autoResolvedWage
  extraPayAmount: number; // 0 if none, always additive
  reason: string | null;
  /** Disciplinary/correction deduction (2026-08-10) — 0 if none, always
   * subtractive. Kept on this same row (not a new table) since it shares
   * the same "one adjustment per employee per shift" shape and timing as
   * override/extra pay above. */
  deductionAmount: number;
  deductionReason: string | null;
}

/** The earlier shift of the same day, for the day-total question at close
 * (2026-08-31, Aey's run-through): Toast — and every online-platform
 * dashboard — may show DAY-TO-DATE numbers at Dinner close, so the form
 * must ask what the entered numbers cover and be able to show exactly
 * what would be subtracted. `toast` is null when Lunch's closing report
 * was never saved — in that case whole-day entry is refused, because
 * there is nothing real to subtract. */
export interface PriorShiftFigures {
  period: string; // "Lunch"
  finalized: boolean;
  /** Lunch's saved Toast-sourced figures, tax resolved the same way the
   * form resolves it (explicit value, else the auto suggestion). */
  toast: Record<string, number> | null;
  /** Lunch's platform records that carry any nonzero figure. */
  platforms: { platformId: number; platformName: string; figures: Record<string, number> }[];
}

export interface ClosingReportData {
  shift: { id: number; date: string; period: string; status: string; incidentReport: string | null } | null;
  /** Non-null only when an earlier shift exists on the same date — the
   * trigger for the "what do these numbers cover?" question. */
  priorShift: PriorShiftFigures | null;
  /** POS closeout modes (2026-08-31, phase 2 of the day-total question):
   * ASK renders the unanswered chooser; PER_SHIFT hides it (the POS
   * clears each close); CUMULATIVE preselects "whole day" — the math
   * line still shows, nothing subtracts silently. */
  toastCloseoutMode: "ASK" | "PER_SHIFT" | "CUMULATIVE";
  platformCloseoutMode: "ASK" | "PER_SHIFT" | "CUMULATIVE";
  /** Restaurant's default sales tax rate (2026-08-10), passed down so the
   * client-side form can LIVE-recompute the suggested Sales tax figure as
   * the manager types Total sales, instead of only computing it once at
   * page load — see ClosingReportForm.tsx. */
  defaultSalesTaxRate: number;
  /** Pools currently split by points -- the Tip points section shows a
   * field per row per pool listed here, and none for equal-split pools
   * (a point field on an equal-split pool would be an inert control). */
  pointWeightedPools: TipPoolGroup[];
  sales: {
    totalSales: number;
    ccTipTotal: number;
    takeoutCcTip: number;
    deliveryToastTip: number;
    toastTakeoutSales: number;
    toastDeliverySales: number;
    cashSales: number;
    cashTip: number;
    pickupCashTip: number;
    grossFoodSales: number;
    grossBeverageSales: number;
    /** Resolved tax: explicit saved value if set, else SUGGESTED
     * (totalSales × defaultSalesTaxRate) — see salesTaxIsAuto. */
    salesTax: number;
    salesTaxIsAuto: boolean;
  } | null;
  platformSales: PlatformSalesRow[];
  /** Tip-pool-eligible roster rows, for the "Tip points" section — this is
   * where point overrides get entered now (moved off the roster page,
   * confirmed with Oliver 2026-08-08: it's a closing-time judgment call,
   * not a staffing decision). NONE-pool rows (Manager, Chef, ...) are
   * excluded since they have no point-weighted share to adjust. */
  pointValueRows: PointValueRow[];
  /** "Bonus metrics" section, per-employee inputs — for EMPLOYEE_SHIFT
   * metrics where each eligible person reports their own number. */
  metricRows: MetricEntryRow[];
  /** "Bonus metrics" section, shift-level inputs — for SHIFT metrics like
   * the host team's shared drink count (one number, split equally among
   * the eligible people staffed this shift). */
  shiftMetricRows: ShiftMetricRow[];
  /** "Wage adjustments" section — optional override + extra pay per employee. */
  wageAdjustmentRows: WageAdjustmentRow[];
  /** How many roster rows still need a tip point decided (2026-08-29).
   * Non-zero means Save & Finalize is refused -- both here for the button
   * and again server-side in confirmFinalize, which is the real gate. */
  undecidedPointCount: number;
}

/** Lunch's saved figures for a Dinner close on the same date, resolved
 * exactly the way the closing form resolves them (explicit tax wins,
 * else the auto suggestion). ONE function on purpose, imported by both
 * the loader (what the form shows it would subtract) and the save action
 * (what actually gets subtracted) — two implementations would let the
 * preview and the stored money drift apart. Returns null when this shift
 * is the day's first period or no earlier shift exists. */
export async function loadPriorShiftFigures(
  date: string,
  period: string,
  taxRate: number
): Promise<PriorShiftFigures | null> {
  if (period !== "Dinner") return null;
  const [lunch] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.date, date), eq(shifts.period, "Lunch")));
  if (!lunch) return null;

  const [lunchSales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, lunch.id));
  const toast = lunchSales
    ? {
        totalSales: lunchSales.totalSales,
        salesTax: lunchSales.salesTax == null ? round2(lunchSales.totalSales * taxRate) : lunchSales.salesTax,
        ccTipTotal: lunchSales.ccTipTotal,
        takeoutCcTip: lunchSales.takeoutCcTip,
        deliveryToastTip: lunchSales.deliveryToastTip,
        toastTakeoutSales: lunchSales.toastTakeoutSales,
        toastDeliverySales: lunchSales.toastDeliverySales,
        cashSales: lunchSales.cashSales,
        grossFoodSales: lunchSales.grossFoodSales,
        grossBeverageSales: lunchSales.grossBeverageSales,
      }
    : null;

  const platformNames = new Map((await db.select().from(onlinePlatforms)).map((p) => [p.id, p.name]));
  const lunchPlatformRecords = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, lunch.id));
  const platforms = lunchPlatformRecords
    .map((r) => ({
      platformId: r.onlinePlatformId,
      platformName: platformNames.get(r.onlinePlatformId) ?? `Platform ${r.onlinePlatformId}`,
      figures: {
        salesAmount: r.salesAmount,
        taxAmount: r.taxAmount == null ? round2(r.salesAmount * taxRate) : r.taxAmount,
        commissionFee: r.commissionFee,
        tipAmountPlatformPickup: r.tipAmountPlatformPickup,
        tipAmountPlatformCourier: r.tipAmountPlatformCourier,
        tipAmountRestaurantDelivery: r.tipAmountRestaurantDelivery,
      },
    }))
    .filter((p) => Object.values(p.figures).some((v) => v !== 0));

  return { period: lunch.period, finalized: lunch.status === "finalized", toast, platforms };
}

export async function loadClosingReportData(shiftId: number): Promise<ClosingReportData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, priorShift: null, toastCloseoutMode: "ASK", platformCloseoutMode: "ASK", defaultSalesTaxRate: 0, pointWeightedPools: [], sales: null, platformSales: [], pointValueRows: [], metricRows: [], shiftMetricRows: [], wageAdjustmentRows: [], undecidedPointCount: 0 };

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const taxRate = settings?.defaultSalesTaxRate ?? 0;
  const pointWeightedPools: TipPoolGroup[] = resolvePointWeightedPools(settings);

  const platforms = await db.select().from(onlinePlatforms);
  const records = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const recordByPlatformId = new Map(records.map((r) => [r.onlinePlatformId, r]));

  const platformSales: PlatformSalesRow[] = platforms.map((p) => {
    const r = recordByPlatformId.get(p.id);
    const salesAmount = r?.salesAmount ?? 0;
    const taxAmountIsAuto = r?.taxAmount == null;
    return {
      platformId: p.id,
      platformName: p.name,
      salesAmount,
      commissionFee: r?.commissionFee ?? 0,
      tipAmountPlatformPickup: r?.tipAmountPlatformPickup ?? 0,
      tipAmountPlatformCourier: r?.tipAmountPlatformCourier ?? 0,
      tipAmountRestaurantDelivery: r?.tipAmountRestaurantDelivery ?? 0,
      taxAmount: taxAmountIsAuto ? round2(salesAmount * taxRate) : r!.taxAmount!,
      taxAmountIsAuto,
    };
  });

  const calcData = await loadShiftCalcData(shiftId);
  const overrideEntries = await db
    .select({
      id: shiftRosterEntries.id,
      pointValueOverride: shiftRosterEntries.pointValueOverride,
      pointOverridePool1: shiftRosterEntries.pointOverridePool1,
      pointOverridePool2: shiftRosterEntries.pointOverridePool2,
      pointOverridePool3: shiftRosterEntries.pointOverridePool3,
    })
    .from(shiftRosterEntries)
    .where(eq(shiftRosterEntries.shiftId, shiftId));
  const overrideByEntry = new Map(
    overrideEntries.map((r) => [
      r.id,
      r.pointValueOverride != null || r.pointOverridePool1 != null || r.pointOverridePool2 != null || r.pointOverridePool3 != null,
    ])
  );
  // Position template points, for the one-tap suggestion beside an
  // undecided field (2026-08-29). defaultTipPointValue is explicitly a
  // template and never feeds calculation -- see positions in db/schema.ts.
  const rosterPositionIdsForPoints = Array.from(new Set(calcData.roster.map((r) => r.positionId)));
  const positionRows = rosterPositionIdsForPoints.length
    ? await db.select().from(positions).where(inArray(positions.id, rosterPositionIdsForPoints))
    : [];
  const defaultPointByPositionId = new Map(positionRows.map((p) => [p.id, p.defaultTipPointValue]));

  const pointValueRows: PointValueRow[] = calcData.roster
    .filter((r) => r.tipPoolGroups.length > 0)
    .map((r) => ({
      rosterEntryId: r.rosterEntryId,
      employeeName: r.employeeName,
      positionName: r.positionName,
      tipPoolGroups: r.tipPoolGroups,
      pointValueByPool: r.pointValueByPool,
      hasOverride: overrideByEntry.get(r.rosterEntryId) === true,
      needsDecision: needsPointDecision(r, pointWeightedPools),
      suggestedPoint: defaultPointByPositionId.get(r.positionId) ?? null,
    }));
  const undecidedPointCount = pointValueRows.filter((r) => r.needsDecision).length;

  // "Bonus metrics" section: enabled EMPLOYEE_SHIFT metrics collected at
  // close, matched against which roster rows are eligible via positionMetrics.
  const employeeShiftMetrics = await db
    .select()
    .from(metricDefinitions)
    .where(
      and(
        eq(metricDefinitions.scope, "EMPLOYEE_SHIFT"),
        eq(metricDefinitions.enabled, true)
      )
    );
  const closeMetrics = employeeShiftMetrics.filter(
    (m) => m.collectionMoment === "close" || m.collectionMoment === "both"
  );

  const metricRows: MetricEntryRow[] = [];
  if (closeMetrics.length > 0) {
    const metricIds = closeMetrics.map((m) => m.id);
    const rosterPositionIds = Array.from(new Set(calcData.roster.map((r) => r.positionId)));

    const eligibility = rosterPositionIds.length
      ? await db
          .select()
          .from(positionMetrics)
          .where(
            and(
              inArray(positionMetrics.positionId, rosterPositionIds),
              inArray(positionMetrics.metricDefinitionId, metricIds)
            )
          )
      : [];
    const eligiblePositionIdsByMetric = new Map<number, Set<number>>();
    for (const e of eligibility) {
      const set = eligiblePositionIdsByMetric.get(e.metricDefinitionId) ?? new Set<number>();
      set.add(e.positionId);
      eligiblePositionIdsByMetric.set(e.metricDefinitionId, set);
    }

    const existingValues = await db
      .select()
      .from(metricValues)
      .where(and(eq(metricValues.shiftId, shiftId), inArray(metricValues.metricDefinitionId, metricIds)));
    const valueByMetricAndEmployee = new Map<string, number>();
    for (const v of existingValues) {
      if (v.employeeId == null) continue;
      valueByMetricAndEmployee.set(`${v.metricDefinitionId}:${v.employeeId}`, v.value);
    }

    for (const metric of closeMetrics) {
      const eligiblePositionIds = eligiblePositionIdsByMetric.get(metric.id);
      if (!eligiblePositionIds || eligiblePositionIds.size === 0) continue;
      for (const r of calcData.roster) {
        if (!eligiblePositionIds.has(r.positionId)) continue;
        metricRows.push({
          rosterEntryId: r.rosterEntryId,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          positionName: r.positionName,
          metricDefinitionId: metric.id,
          metricKey: metric.key,
          metricLabel: metric.label,
          currentValue: valueByMetricAndEmployee.get(`${metric.id}:${r.employeeId}`) ?? 0,
        });
      }
    }
  }

  // "Bonus metrics" (shift-level): enabled SHIFT metrics collected at close,
  // shown only if at least one eligible position (via positionMetrics) is
  // actually staffed this shift — e.g. the host team's shared drink count.
  const shiftMetrics = await db
    .select()
    .from(metricDefinitions)
    .where(
      and(
        eq(metricDefinitions.scope, "SHIFT"),
        eq(metricDefinitions.enabled, true)
      )
    );
  const shiftCloseMetrics = shiftMetrics.filter(
    (m) => m.collectionMoment === "close" || m.collectionMoment === "both"
  );

  const shiftMetricRows: ShiftMetricRow[] = [];
  if (shiftCloseMetrics.length > 0) {
    const metricIds = shiftCloseMetrics.map((m) => m.id);
    const rosterPositionIds = Array.from(new Set(calcData.roster.map((r) => r.positionId)));

    const eligibility = rosterPositionIds.length
      ? await db
          .select()
          .from(positionMetrics)
          .where(
            and(
              inArray(positionMetrics.positionId, rosterPositionIds),
              inArray(positionMetrics.metricDefinitionId, metricIds)
            )
          )
      : [];
    const eligibleMetricIds = new Set(eligibility.map((e) => e.metricDefinitionId));

    const existingShiftValues = await db
      .select()
      .from(metricValues)
      .where(and(eq(metricValues.shiftId, shiftId), inArray(metricValues.metricDefinitionId, metricIds)));
    const shiftValueByMetric = new Map<number, number>();
    for (const v of existingShiftValues) {
      if (v.employeeId != null) continue; // shift-level rows have no employeeId
      shiftValueByMetric.set(v.metricDefinitionId, v.value);
    }

    for (const metric of shiftCloseMetrics) {
      if (!eligibleMetricIds.has(metric.id)) continue;
      shiftMetricRows.push({
        metricDefinitionId: metric.id,
        metricKey: metric.key,
        metricLabel: metric.label,
        currentValue: shiftValueByMetric.get(metric.id) ?? 0,
      });
    }
  }

  // "Wage adjustments" section: one row per unique employee on the roster,
  // pointing at whichever of their roles is the auto wage-bearing one
  // (same selection loadShiftCalcData already does — a row's wageNote
  // starts with "Wage counted under..." if it's NOT the wage-bearing row).
  const wageAdjustmentRecords = await db
    .select()
    .from(shiftWageAdjustments)
    .where(eq(shiftWageAdjustments.shiftId, shiftId));
  const adjustmentByEmployeeId = new Map(wageAdjustmentRecords.map((a) => [a.employeeId, a]));

  const rowsByEmployeeId = new Map<number, typeof calcData.roster>();
  for (const r of calcData.roster) {
    const list = rowsByEmployeeId.get(r.employeeId) ?? [];
    list.push(r);
    rowsByEmployeeId.set(r.employeeId, list);
  }

  const wageAdjustmentRows: WageAdjustmentRow[] = [];
  for (const [employeeId, rows] of rowsByEmployeeId) {
    const wageBearingRow = rows.find((r) => !r.wageNote?.startsWith("Wage counted under")) ?? rows[0];
    const adjustment = adjustmentByEmployeeId.get(employeeId);
    wageAdjustmentRows.push({
      employeeId,
      employeeName: wageBearingRow.employeeName,
      wageBearingPositionName: wageBearingRow.positionName,
      wageBearingPositionCategory: wageBearingRow.positionCategory,
      autoResolvedWage: wageBearingRow.flatWage,
      wageOverrideAmount: adjustment?.wageOverrideAmount ?? null,
      extraPayAmount: adjustment?.extraPayAmount ?? 0,
      reason: adjustment?.reason ?? null,
      deductionAmount: adjustment?.deductionAmount ?? 0,
      deductionReason: adjustment?.deductionReason ?? null,
    });
  }
  wageAdjustmentRows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status, incidentReport: shift.incidentReport },
    priorShift: await loadPriorShiftFigures(shift.date, shift.period, taxRate),
    toastCloseoutMode: settings?.toastCloseoutMode ?? "ASK",
    platformCloseoutMode: settings?.platformCloseoutMode ?? "ASK",
    defaultSalesTaxRate: taxRate,
    pointWeightedPools,
    sales: sales
      ? {
          totalSales: sales.totalSales,
          ccTipTotal: sales.ccTipTotal,
          takeoutCcTip: sales.takeoutCcTip,
          deliveryToastTip: sales.deliveryToastTip,
          toastTakeoutSales: sales.toastTakeoutSales,
          toastDeliverySales: sales.toastDeliverySales,
          cashSales: sales.cashSales,
          cashTip: sales.cashTip,
          pickupCashTip: sales.pickupCashTip,
          grossFoodSales: sales.grossFoodSales,
          grossBeverageSales: sales.grossBeverageSales,
          salesTax: sales.salesTax == null ? round2(sales.totalSales * taxRate) : sales.salesTax,
          salesTaxIsAuto: sales.salesTax == null,
        }
      : null,
    platformSales,
    pointValueRows,
    metricRows,
    shiftMetricRows,
    wageAdjustmentRows,
    undecidedPointCount,
  };
}
