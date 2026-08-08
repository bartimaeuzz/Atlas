import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shiftSales, onlinePlatformSalesRecords, restaurantSettings } from "@/db/schema";
import { loadShiftCalcData } from "./loadRosterForCalc";
import { buildFinalizationResult, type FinalizeRosterRow, type FinalizeShiftResult } from "@/lib/calc/finalizeShift";

export interface FinalizationPreview {
  shift: { id: number; date: string; period: string; status: string };
  sales: { totalSales: number; ccTipTotal: number; cashSales: number };
  result: FinalizeShiftResult;
  employeeNames: Record<number, string>;
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

  const result = buildFinalizationResult({
    deductionRate,
    grossCcTip: sales.ccTipTotal,
    takeoutCcTip: sales.takeoutCcTip,
    deliveryToastTip: sales.deliveryToastTip,
    platformCourierTips,
    platformDeliveryTips,
    pool1SplitMethod,
    pool2SplitMethod,
    pool3SplitMethod,
    roster,
  });

  const employeeNames: Record<number, string> = {};
  for (const r of calcData.roster) employeeNames[r.employeeId] = r.employeeName;

  return {
    shift: calcData.shift,
    sales: { totalSales: sales.totalSales, ccTipTotal: sales.ccTipTotal, cashSales: sales.cashSales },
    result,
    employeeNames,
  };
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
