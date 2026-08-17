/**
 * Petty Cash report loader (2026-08-14) -- powers the "Petty Cash" tab on
 * the existing /reports page. Oliver's own instruction: "we already got
 * report page, we should utilize that page to show different report,"
 * rather than building a separate week/month calendar UI under `/ledger`.
 * Reuses that page's existing date-range picker (This week/month/year
 * presets + custom range) -- this loader just needs a from/to range, same
 * shape as loadSalesTaxReport.
 *
 * Per-day status/match is computed with the exact same formula
 * lib/ledger/loadPettyCashDay.ts uses for a single day (beginning balance
 * + cash sales/tip pulled from that date's finalized shifts + other cash
 * - petty cash paid out = expected total balance, compared against the
 * manager's counted amount) -- duplicated here rather than calling that
 * loader once per day in a loop, since looping it across a month would be
 * an N+1 query storm. Bulk-fetches everything in the range up front
 * instead.
 *
 * 2026-08-14 follow-up: added `finalizedByName` per day (Oliver's ask:
 * "add column show responsible floor manager") -- pulled from the same
 * dailyCashReconciliations.finalizedByEmployeeId the day-level ledger
 * page already records, left-joined since draft/no-data days have none.
 */

import { and, gte, lte, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pettyCashEntries, dailyCashReconciliations, shifts, shiftSales, employees } from "@/db/schema";
import { addDays } from "@/lib/schedule/weekMath";

export interface PettyCashReportDay {
  date: string;
  totalSpent: number;
  entryCount: number;
  status: "no_data" | "draft" | "finalized";
  /** Only meaningful when status is "finalized" -- whether the manager's
   * counted amount matched the expected total balance. */
  matches: boolean | null;
  /** Who finalized this day's reconciliation -- null until finalized. */
  finalizedByName: string | null;
}

export interface PettyCashReportData {
  days: PettyCashReportDay[];
  totalSpent: number;
  finalizedCount: number;
  mismatchCount: number;
}

export async function loadPettyCashReport(from: string, to: string): Promise<PettyCashReportData> {
  const [entryRows, reconRows, shiftSalesRows] = await Promise.all([
    db
      .select({ date: pettyCashEntries.date, amount: pettyCashEntries.amount })
      .from(pettyCashEntries)
      .where(and(gte(pettyCashEntries.date, from), lte(pettyCashEntries.date, to))),
    db
      .select({
        date: dailyCashReconciliations.date,
        beginningBalance: dailyCashReconciliations.beginningBalance,
        otherCash: dailyCashReconciliations.otherCash,
        countedAmount: dailyCashReconciliations.countedAmount,
        status: dailyCashReconciliations.status,
        finalizedByName: employees.nickname,
      })
      .from(dailyCashReconciliations)
      .leftJoin(employees, eq(dailyCashReconciliations.finalizedByEmployeeId, employees.id))
      .where(and(gte(dailyCashReconciliations.date, from), lte(dailyCashReconciliations.date, to))),
    db
      .select({ date: shifts.date, cashSales: shiftSales.cashSales, cashTip: shiftSales.cashTip })
      .from(shiftSales)
      .innerJoin(shifts, eq(shiftSales.shiftId, shifts.id))
      .where(and(gte(shifts.date, from), lte(shifts.date, to), eq(shifts.status, "finalized"))),
  ]);

  const spentByDate = new Map<string, { total: number; count: number }>();
  for (const e of entryRows) {
    const cur = spentByDate.get(e.date) ?? { total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    spentByDate.set(e.date, cur);
  }

  const reconByDate = new Map(reconRows.map((r) => [r.date, r]));

  const cashByDate = new Map<string, { sales: number; tip: number }>();
  for (const r of shiftSalesRows) {
    const cur = cashByDate.get(r.date) ?? { sales: 0, tip: 0 };
    cur.sales += r.cashSales;
    cur.tip += r.cashTip;
    cashByDate.set(r.date, cur);
  }

  const days: PettyCashReportDay[] = [];
  let d = from;
  // Guard against a pathologically large range (e.g. a mistyped custom
  // range) turning this into an unbounded loop -- caps at ~2 years, well
  // beyond any real preset or sane custom range.
  let guard = 0;
  while (d <= to && guard < 800) {
    guard++;
    const spent = spentByDate.get(d);
    const recon = reconByDate.get(d);
    const cash = cashByDate.get(d);
    const totalSpent = spent?.total ?? 0;

    let status: "no_data" | "draft" | "finalized" = "no_data";
    let matches: boolean | null = null;

    if (recon) {
      status = recon.status as "draft" | "finalized";
      if (recon.status === "finalized" && recon.countedAmount != null) {
        const totalCashIn = (cash?.sales ?? 0) + (cash?.tip ?? 0) + recon.otherCash;
        const expectedTotalBalance = recon.beginningBalance + totalCashIn - totalSpent;
        matches = Math.abs(recon.countedAmount - expectedTotalBalance) < 0.01;
      }
    } else if (totalSpent > 0) {
      status = "draft";
    }

    days.push({
      date: d,
      totalSpent,
      entryCount: spent?.count ?? 0,
      status,
      matches,
      finalizedByName: recon?.status === "finalized" ? (recon.finalizedByName ?? null) : null,
    });
    d = addDays(d, 1);
  }

  return {
    days,
    totalSpent: days.reduce((sum, day) => sum + day.totalSpent, 0),
    finalizedCount: days.filter((day) => day.status === "finalized").length,
    mismatchCount: days.filter((day) => day.matches === false).length,
  };
}
