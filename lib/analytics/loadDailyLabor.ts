/**
 * Per-day labor cost, net sales and labor % for the schedule's week grid
 * and month overview (2026-09-04, Oliver — competitor-DNA backlog item 2,
 * "Labor % on each day of the week strip / month overview, shown once the
 * day is locked; colour only when over target").
 *
 * Deliberately NOT new money math. Both halves are borrowed whole:
 *
 *   sales — `loadDailyNetSales`, which wraps `loadSalesTaxReport`'s
 *     per-calendar-day rollup of FINALIZED shifts and the "which column
 *     means what" gotchas already resolved from Oliver's own March
 *     workbook. Net sales for a day is its Toast netSale plus every
 *     online platform's net for that date, which is exactly what
 *     `loadRevenueBreakdown` calls revenue for the P&L — excludes tax,
 *     excludes tips. That module was split out of this one on 2026-09-04
 *     when sales targets needed the same figure without the payroll half;
 *     one definition, so the schedule, a target and Analytics cannot
 *     disagree about the same day.
 *
 *   labor — `laborCostOfPayout` from loadPayrollCost.ts: wages + extra pay
 *     + incentives - deductions, never tips, because tips are the
 *     customer's money passing through and not a restaurant expense.
 *     Payroll tax is not included; Mohom does not compute it, and the
 *     Settings copy for the target says so out loud.
 *
 * "Once the day is locked" falls out of the finalized-only filter both
 * sources already apply: a draft shift contributes nothing, so a day that
 * is half-closed reports only the closed half. That is a real edge — a
 * restaurant that closes Lunch and leaves Dinner in draft sees a labor %
 * built on Lunch alone. `complete` says which days had every shift
 * finalized so the UI can decline to judge a partial day rather than
 * quietly showing a number that will move.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { employeePayouts, shifts } from "@/db/schema";
import { loadDailyNetSales } from "@/lib/analytics/loadDailyNetSales";
import { laborCostOfPayout } from "@/lib/analytics/loadPayrollCost";
import type { DailyLaborByDate } from "@/lib/analytics/laborTarget";

export type { DailyLabor, DailyLaborByDate } from "@/lib/analytics/laborTarget";
export { LABOR_TARGET_PRESETS, laborTargetLabel, laborVerdict, type LaborVerdict } from "@/lib/analytics/laborTarget";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

/** Days with no finalized shift at all are simply absent from the result —
 * the caller renders nothing for them, which is the honest state for a day
 * nobody has closed yet. */
export async function loadDailyLabor(dateFrom: string, dateTo: string): Promise<DailyLaborByDate> {
  const [sales, payoutRows] = await Promise.all([
    // The one definition of a day's net sales, shared with sales targets
    // (2026-09-04) — extracted rather than copied so the schedule, a
    // target and Analytics can never drift apart on the same Tuesday.
    loadDailyNetSales(dateFrom, dateTo),
    db
      .select({
        date: shifts.date,
        flatWageAmount: employeePayouts.flatWageAmount,
        extraPayAmount: employeePayouts.extraPayAmount,
        incentiveAmount: employeePayouts.incentiveAmount,
        deductionAmount: employeePayouts.deductionAmount,
      })
      .from(employeePayouts)
      .innerJoin(shifts, eq(employeePayouts.shiftId, shifts.id))
      .where(and(eq(shifts.status, "finalized"), gte(shifts.date, dateFrom), lte(shifts.date, dateTo))),
  ]);

  const laborByDate = new Map<string, number>();
  for (const p of payoutRows) {
    laborByDate.set(p.date, round2((laborByDate.get(p.date) ?? 0) + laborCostOfPayout(p)));
  }

  const hasDraft = sales.incomplete;

  const out: DailyLaborByDate = {};
  for (const date of new Set([...Object.keys(sales.byDate), ...laborByDate.keys()])) {
    const netSales = sales.byDate[date]?.netSales ?? 0;
    const laborCost = laborByDate.get(date) ?? 0;
    out[date] = {
      date,
      netSales,
      laborCost,
      laborPct: netSales > 0 ? laborCost / netSales : null,
      complete: !hasDraft.has(date),
    };
  }
  return out;
}
