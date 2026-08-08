import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords } from "@/db/schema";

export interface PlatformSalesRow {
  platformId: number;
  platformName: string;
  salesAmount: number;
  commissionFee: number;
  tipAmountPlatformCourier: number;
  tipAmountRestaurantDelivery: number;
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
}

export async function loadClosingReportData(shiftId: number): Promise<ClosingReportData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, sales: null, platformSales: [] };

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
  };
}
