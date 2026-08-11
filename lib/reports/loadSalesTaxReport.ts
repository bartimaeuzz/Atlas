/**
 * Sales/tax export report loader (2026-08-10) — built after reviewing
 * Oliver's real "MARCH 2026.xlsx" monthly report from Aey. Rolls up
 * FINALIZED shifts into daily rows matching that file's layout: a Toast
 * section (dine-in + takeout + Toast-delivery, all funnel through the
 * restaurant's own card terminal) and one section per online platform
 * (Grubhub/Uber/DoorDash/HungryPanda), each with Net/Tax/Tips/Total.
 *
 * IMPORTANT — column semantics, confirmed with Oliver 2026-08-10: the real
 * file's "CC" and "Total Credit" columns are swapped relative to their own
 * labels (proven with the real numbers: every row's labeled-"Total Credit"
 * + labeled-"CC Tips" = labeled-"CC", meaning labeled-"CC" is actually the
 * total that hit the card terminal including tips, and labeled-"Total
 * Credit" is actually the card-sales-only portion). This report uses the
 * CORRECT labels (confirmed with Oliver, not perpetuating the swap):
 *   ccSalesOnly  = totalSales - cashSales      (card sales, no tip)
 *   totalCredit  = ccSalesOnly + ccTipTotal    (everything through the terminal)
 *
 * Atlas's `shifts` table is one row per MEAL PERIOD (Lunch/Dinner), not per
 * calendar day, but Toast/accounting reports by calendar day — so every sum
 * below groups by `shifts.date`, combining Lunch+Dinner automatically.
 *
 * Sales tax: shiftSales.salesTax / onlinePlatformSalesRecords.taxAmount are
 * nullable (null = never explicitly saved for that record). Same auto-fill
 * formula as loadClosingReportData.ts is applied here too, so a report
 * pulled over OLD shifts (finalized before this feature existed, or a
 * manager who never revisited the closing report) still gets a reasonable
 * tax figure instead of silently reporting $0.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords, restaurantSettings } from "@/db/schema";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export interface DailyToastRow {
  date: string;
  netSale: number;
  tax: number;
  totalSale: number;
  cash: number;
  ccSalesOnly: number;
  ccTips: number;
  totalCredit: number;
}

export interface DailyPlatformRow {
  date: string;
  platformId: number;
  platformName: string;
  net: number;
  tax: number;
  tips: number;
  total: number;
}

export interface SalesTaxReportTotals {
  netSale: number;
  tax: number;
  totalSale: number;
  cash: number;
  ccSalesOnly: number;
  ccTips: number;
  totalCredit: number;
}

export interface PlatformTotals {
  platformId: number;
  platformName: string;
  net: number;
  tax: number;
  tips: number;
  total: number;
}

export interface SalesTaxReportData {
  dateFrom: string;
  dateTo: string;
  toastDays: DailyToastRow[];
  toastTotals: SalesTaxReportTotals;
  platformNames: { platformId: number; platformName: string }[];
  platformDays: DailyPlatformRow[]; // flat — group by platformId in the UI/export
  platformTotals: PlatformTotals[];
  onlineTotals: { net: number; tax: number; tips: number; total: number };
}

/** Sums this shift's sales tax the same auto-fill-then-explicit way
 * loadClosingReportData.ts does, so old/never-revisited shifts still
 * report a sane figure. */
function resolveTax(explicit: number | null, base: number, rate: number): number {
  return explicit == null ? round2(base * rate) : explicit;
}

export async function loadSalesTaxReport(dateFrom: string, dateTo: string): Promise<SalesTaxReportData> {
  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const taxRate = settings?.defaultSalesTaxRate ?? 0;

  const shiftRows = await db
    .select({
      shiftId: shifts.id,
      date: shifts.date,
      status: shifts.status,
      totalSales: shiftSales.totalSales,
      ccTipTotal: shiftSales.ccTipTotal,
      cashSales: shiftSales.cashSales,
      salesTax: shiftSales.salesTax,
    })
    .from(shifts)
    .innerJoin(shiftSales, eq(shiftSales.shiftId, shifts.id))
    .where(and(eq(shifts.status, "finalized"), gte(shifts.date, dateFrom), lte(shifts.date, dateTo)));

  const byDate = new Map<string, DailyToastRow>();
  for (const r of shiftRows) {
    const tax = resolveTax(r.salesTax, r.totalSales, taxRate);
    const existing = byDate.get(r.date) ?? {
      date: r.date,
      netSale: 0,
      tax: 0,
      totalSale: 0,
      cash: 0,
      ccSalesOnly: 0,
      ccTips: 0,
      totalCredit: 0,
    };
    existing.netSale = round2(existing.netSale + r.totalSales);
    existing.tax = round2(existing.tax + tax);
    existing.cash = round2(existing.cash + r.cashSales);
    existing.ccTips = round2(existing.ccTips + r.ccTipTotal);
    byDate.set(r.date, existing);
  }
  const toastDays = Array.from(byDate.values())
    .map((row) => {
      const ccSalesOnly = round2(row.netSale - row.cash);
      return {
        ...row,
        totalSale: round2(row.netSale + row.tax),
        ccSalesOnly,
        totalCredit: round2(ccSalesOnly + row.ccTips),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const toastTotals: SalesTaxReportTotals = toastDays.reduce(
    (acc, d) => ({
      netSale: round2(acc.netSale + d.netSale),
      tax: round2(acc.tax + d.tax),
      totalSale: round2(acc.totalSale + d.totalSale),
      cash: round2(acc.cash + d.cash),
      ccSalesOnly: round2(acc.ccSalesOnly + d.ccSalesOnly),
      ccTips: round2(acc.ccTips + d.ccTips),
      totalCredit: round2(acc.totalCredit + d.totalCredit),
    }),
    { netSale: 0, tax: 0, totalSale: 0, cash: 0, ccSalesOnly: 0, ccTips: 0, totalCredit: 0 }
  );

  // Online platforms — same grouping, one row per (date, platform).
  const platforms = await db.select().from(onlinePlatforms);
  const platformRows = await db
    .select({
      shiftId: onlinePlatformSalesRecords.shiftId,
      date: shifts.date,
      status: shifts.status,
      onlinePlatformId: onlinePlatformSalesRecords.onlinePlatformId,
      salesAmount: onlinePlatformSalesRecords.salesAmount,
      taxAmount: onlinePlatformSalesRecords.taxAmount,
      tipAmountPlatformCourier: onlinePlatformSalesRecords.tipAmountPlatformCourier,
      tipAmountRestaurantDelivery: onlinePlatformSalesRecords.tipAmountRestaurantDelivery,
    })
    .from(onlinePlatformSalesRecords)
    .innerJoin(shifts, eq(shifts.id, onlinePlatformSalesRecords.shiftId))
    .where(and(eq(shifts.status, "finalized"), gte(shifts.date, dateFrom), lte(shifts.date, dateTo)));

  const platformNameById = new Map(platforms.map((p) => [p.id, p.name]));
  const byDatePlatform = new Map<string, DailyPlatformRow>();
  for (const r of platformRows) {
    const tips = round2(r.tipAmountPlatformCourier + r.tipAmountRestaurantDelivery);
    const tax = resolveTax(r.taxAmount, r.salesAmount, taxRate);
    const key = `${r.date}:${r.onlinePlatformId}`;
    const existing = byDatePlatform.get(key) ?? {
      date: r.date,
      platformId: r.onlinePlatformId,
      platformName: platformNameById.get(r.onlinePlatformId) ?? "Unknown",
      net: 0,
      tax: 0,
      tips: 0,
      total: 0,
    };
    existing.net = round2(existing.net + r.salesAmount);
    existing.tax = round2(existing.tax + tax);
    existing.tips = round2(existing.tips + tips);
    byDatePlatform.set(key, existing);
  }
  const platformDays = Array.from(byDatePlatform.values())
    .map((row) => ({ ...row, total: round2(row.net + row.tax + row.tips) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.platformId - b.platformId);

  const platformTotalsById = new Map<number, PlatformTotals>();
  for (const row of platformDays) {
    const existing = platformTotalsById.get(row.platformId) ?? {
      platformId: row.platformId,
      platformName: row.platformName,
      net: 0,
      tax: 0,
      tips: 0,
      total: 0,
    };
    existing.net = round2(existing.net + row.net);
    existing.tax = round2(existing.tax + row.tax);
    existing.tips = round2(existing.tips + row.tips);
    existing.total = round2(existing.total + row.total);
    platformTotalsById.set(row.platformId, existing);
  }
  // Keep a stable platform order (seed order) even if a platform had zero activity this range.
  const platformTotals = platforms.map(
    (p) =>
      platformTotalsById.get(p.id) ?? { platformId: p.id, platformName: p.name, net: 0, tax: 0, tips: 0, total: 0 }
  );

  const onlineTotals = platformTotals.reduce(
    (acc, p) => ({
      net: round2(acc.net + p.net),
      tax: round2(acc.tax + p.tax),
      tips: round2(acc.tips + p.tips),
      total: round2(acc.total + p.total),
    }),
    { net: 0, tax: 0, tips: 0, total: 0 }
  );

  return {
    dateFrom,
    dateTo,
    toastDays,
    toastTotals,
    platformNames: platforms.map((p) => ({ platformId: p.id, platformName: p.name })),
    platformDays,
    platformTotals,
    onlineTotals,
  };
}
