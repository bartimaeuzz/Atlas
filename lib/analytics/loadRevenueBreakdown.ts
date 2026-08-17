/**
 * Revenue-by-channel breakdown for the Analytics/P&L page (2026-08-16).
 * Deliberately a thin reshape of loadSalesTaxReport.ts's existing
 * aggregation rather than a second query against shiftSales/
 * onlinePlatformSalesRecords — that loader already resolved the real
 * "which column means what" gotchas (see its own header comment on the
 * Toast CC/Total Credit label swap) and already filters to
 * status="finalized" shifts. Re-deriving that here would risk drifting
 * out of sync with the Sales & Tax report Oliver already trusts.
 *
 * "Revenue" here means NET sales (excludes tax, excludes tips) — the
 * correct top-line figure for a P&L. `loadSalesTaxReport` already
 * separates net/tax/tips per channel, so this just picks `net` out of
 * each and adds percentage-of-total, matching the reference workbook's
 * Chart sheet convention (each channel shown with its dollar amount,
 * doughnut-chart-ready).
 */
import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export interface RevenueChannelSlice {
  channel: string;
  amount: number;
  /** 0-1, share of total revenue this range. 0 if total revenue is 0. */
  share: number;
}

export interface RevenueBreakdown {
  dateFrom: string;
  dateTo: string;
  total: number;
  /** Toast first, then each online platform in seed order — same order
   * the Sales & Tax report already uses, so the two reports read as the
   * same restaurant story. */
  channels: RevenueChannelSlice[];
}

export async function loadRevenueBreakdown(dateFrom: string, dateTo: string): Promise<RevenueBreakdown> {
  const salesTax = await loadSalesTaxReport(dateFrom, dateTo);

  const rawChannels: { channel: string; amount: number }[] = [
    { channel: "Toast (in-house)", amount: salesTax.toastTotals.netSale },
    ...salesTax.platformTotals.map((p) => ({ channel: p.platformName, amount: p.net })),
  ];

  const total = round2(rawChannels.reduce((sum, c) => sum + c.amount, 0));

  const channels: RevenueChannelSlice[] = rawChannels.map((c) => ({
    channel: c.channel,
    amount: round2(c.amount),
    share: total > 0 ? c.amount / total : 0,
  }));

  return { dateFrom, dateTo, total, channels };
}
