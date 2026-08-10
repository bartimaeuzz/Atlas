import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords,
  metricDefinitions, positionMetrics, metricValues, shiftWageAdjustments,
} from "@/db/schema";
import { loadShiftCalcData, type TipPoolGroup } from "@/lib/shift/loadRosterForCalc";

export interface PlatformSalesRow {
  platformId: number;
  platformName: string;
  salesAmount: number;
  commissionFee: number;
  tipAmountPlatformCourier: number;
  tipAmountRestaurantDelivery: number;
}

export interface PointValueRow {
  rosterEntryId: number;
  employeeName: string;
  positionName: string;
  tipPoolGroups: TipPoolGroup[];
  pointValue: number; // current resolved value (override if set, else standing value)
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
  /** The auto-resolved wage for reference, or null if no rate is set for
   * that position/period (shown so the manager knows what they're
   * overriding, or why an override might be needed). */
  autoResolvedWage: number | null;
  wageOverrideAmount: number | null; // null = use autoResolvedWage
  extraPayAmount: number; // 0 if none, always additive
  reason: string | null;
}

export interface ClosingReportData {
  shift: { id: number; date: string; period: string; status: string } | null;
  sales: {
    totalSales: number;
    ccTipTotal: number;
    takeoutCcTip: number;
    deliveryToastTip: number;
    cashSales: number;
    grossFoodSales: number;
    grossBeverageSales: number;
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
}

export async function loadClosingReportData(shiftId: number): Promise<ClosingReportData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, sales: null, platformSales: [], pointValueRows: [], metricRows: [], shiftMetricRows: [], wageAdjustmentRows: [] };

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));

  const platforms = await db.select().from(onlinePlatforms);
  const records = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const recordByPlatformId = new Map(records.map((r) => [r.onlinePlatformId, r]));

  const platformSales: PlatformSalesRow[] = platforms.map((p) => {
    const r = recordByPlatformId.get(p.id);
    return {
      platformId: p.id,
      platformName: p.name,
      salesAmount: r?.salesAmount ?? 0,
      commissionFee: r?.commissionFee ?? 0,
      tipAmountPlatformCourier: r?.tipAmountPlatformCourier ?? 0,
      tipAmountRestaurantDelivery: r?.tipAmountRestaurantDelivery ?? 0,
    };
  });

  const calcData = await loadShiftCalcData(shiftId);
  const pointValueRows: PointValueRow[] = calcData.roster
    .filter((r) => r.tipPoolGroups.length > 0)
    .map((r) => ({
      rosterEntryId: r.rosterEntryId,
      employeeName: r.employeeName,
      positionName: r.positionName,
      tipPoolGroups: r.tipPoolGroups,
      pointValue: r.pointValue,
    }));

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
      autoResolvedWage: wageBearingRow.flatWage,
      wageOverrideAmount: adjustment?.wageOverrideAmount ?? null,
      extraPayAmount: adjustment?.extraPayAmount ?? 0,
      reason: adjustment?.reason ?? null,
    });
  }
  wageAdjustmentRows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status },
    sales: sales
      ? {
          totalSales: sales.totalSales,
          ccTipTotal: sales.ccTipTotal,
          takeoutCcTip: sales.takeoutCcTip,
          deliveryToastTip: sales.deliveryToastTip,
          cashSales: sales.cashSales,
          grossFoodSales: sales.grossFoodSales,
          grossBeverageSales: sales.grossBeverageSales,
        }
      : null,
    platformSales,
    pointValueRows,
    metricRows,
    shiftMetricRows,
    wageAdjustmentRows,
  };
}
