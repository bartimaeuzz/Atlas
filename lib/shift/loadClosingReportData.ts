import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords } from "@/db/schema";
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
}

export async function loadClosingReportData(shiftId: number): Promise<ClosingReportData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, sales: null, platformSales: [], pointValueRows: [] };

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
  };
}
