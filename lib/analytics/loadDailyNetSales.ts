/**
 * Net sales per calendar day (2026-09-04) — lifted out of loadDailyLabor
 * unchanged when sales targets arrived and needed the same figure without
 * the payroll half.
 *
 * There is exactly one definition of "net sales for a day" in Atlas and
 * this is it: `loadSalesTaxReport` rolls FINALIZED shifts up per calendar
 * day and has already resolved the "which column means what" gotchas from
 * Oliver's own March workbook; a day is its Toast netSale plus every
 * online platform's net for that date, which is what
 * `loadRevenueBreakdown` calls revenue for the P&L. Tax excluded, tips
 * excluded. The schedule, Analytics and a sales target must never disagree
 * about the same Tuesday, which is the whole reason this is one function
 * and not two similar ones.
 *
 * `complete` exists because both money sources filter drafts out before we
 * ever see them, so a day with Lunch closed and Dinner still open reports
 * Lunch alone and looks finished. A caller that is about to attach a
 * verdict — over target, under target — has to know the number can still
 * move.
 */
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts } from "@/db/schema";
import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";

export interface DailyNetSales {
  date: string;
  /** Toast net plus every platform's net, no tax, no tips. */
  netSales: number;
  /** True when every shift that exists on this date is finalized. */
  complete: boolean;
}

export type DailyNetSalesByDate = Record<string, DailyNetSales>;

export interface DailyNetSalesResult {
  byDate: DailyNetSalesByDate;
  /** Dates in the range with at least one shift still in draft. Exposed
   * separately because loadDailyLabor reports days that have labor and no
   * sales, and those never appear in `byDate`. */
  incomplete: Set<string>;
}

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

/** Days with no finalized shift at all are absent from `byDate` — the
 * caller renders nothing for them, which is the honest state for a day
 * nobody has closed yet. */
export async function loadDailyNetSales(dateFrom: string, dateTo: string): Promise<DailyNetSalesResult> {
  const [salesReport, shiftRows] = await Promise.all([
    loadSalesTaxReport(dateFrom, dateTo),
    // Every shift in the range, draft included — the only way to know a
    // date is half-closed, since the money source filters drafts out.
    db
      .select({ date: shifts.date, status: shifts.status })
      .from(shifts)
      .where(and(gte(shifts.date, dateFrom), lte(shifts.date, dateTo))),
  ]);

  const salesByDate = new Map<string, number>();
  for (const d of salesReport.toastDays) {
    salesByDate.set(d.date, round2((salesByDate.get(d.date) ?? 0) + d.netSale));
  }
  for (const d of salesReport.platformDays) {
    salesByDate.set(d.date, round2((salesByDate.get(d.date) ?? 0) + d.net));
  }

  const hasDraft = new Set(shiftRows.filter((s) => s.status !== "finalized").map((s) => s.date));

  const byDate: DailyNetSalesByDate = {};
  for (const [date, netSales] of salesByDate) {
    byDate[date] = { date, netSales, complete: !hasDraft.has(date) };
  }
  return { byDate, incomplete: hasDraft };
}

/** Just the numbers, for the trend helper in salesTarget.ts — which is
 * pure and must not know about this module's shape. */
export function netSalesAmounts(byDate: DailyNetSalesByDate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [date, d] of Object.entries(byDate)) out[date] = d.netSales;
  return out;
}
