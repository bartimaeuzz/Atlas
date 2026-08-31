import { and, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { payrollPeriods, payrollPeriodEmployeeTotals, shifts } from "@/db/schema";
import { weekStartFor, shiftWeek, datesInWeek } from "@/lib/schedule/weekMath";

/** Payroll front door data (2026-08-31, Aey's run-through: the register
 * was one week at a time behind Prev/Next links — finding a week eight
 * weeks back took eight clicks). Year → months → weeks, the same shape
 * /ledger's landing already taught her.
 *
 * A week belongs to the month its SUNDAY falls in — Oliver's call
 * (2026-08-31, option B): payroll leaves the bank after the week closes,
 * so grouping by the closing Sunday lines the months up with the bank
 * statement Aey reconciles against. Every week appears in exactly one
 * month.
 *
 * Deliberately does NOT run the live register per week — that computes
 * tip pools across every shift and would run 52× per page view. What a
 * month list needs is cheaper: PAID weeks show the locked snapshot's
 * total (payrollPeriodEmployeeTotals, written by markPayrollPeriodPaid);
 * DRAFT weeks show finalized-shift progress instead of a number that
 * would still be moving anyway. */

export interface PayrollWeekSummary {
  weekStart: string; // Monday, ISO
  weekEnd: string; // Sunday, ISO
  status: "paid" | "draft";
  /** Locked snapshot total for PAID weeks; null while draft. */
  paidTotal: number | null;
  shiftCount: number;
  finalizedShiftCount: number;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface PayrollMonthSummary {
  month: string; // YYYY-MM (of the weeks' Sundays)
  name: string;
  weeks: PayrollWeekSummary[];
  paidWeekCount: number;
  paidTotal: number;
  isCurrent: boolean;
  isFuture: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function loadPayrollYear(year: number, todayIso: string): Promise<PayrollMonthSummary[]> {
  // Every Monday whose Sunday falls inside `year`. The first such week can
  // START in the previous December (e.g. Mon Dec 29 – Sun Jan 4) — that is
  // exactly the point of grouping by Sunday.
  const weekStarts: string[] = [];
  let ws = weekStartFor(`${year}-01-01`);
  while (datesInWeek(ws)[6].slice(0, 4) === String(year)) {
    weekStarts.push(ws);
    ws = shiftWeek(ws, 1);
  }

  const firstDay = weekStarts[0];
  const lastDay = datesInWeek(weekStarts[weekStarts.length - 1])[6];

  const periods = await db
    .select()
    .from(payrollPeriods)
    .where(and(gte(payrollPeriods.weekStartDate, firstDay), lte(payrollPeriods.weekStartDate, lastDay)));
  const periodByWeek = new Map(periods.map((p) => [p.weekStartDate, p]));

  const paidPeriodIds = periods.filter((p) => p.status === "paid").map((p) => p.id);
  const totalsRows = paidPeriodIds.length
    ? await db
        .select()
        .from(payrollPeriodEmployeeTotals)
        .where(inArray(payrollPeriodEmployeeTotals.payrollPeriodId, paidPeriodIds))
    : [];
  const paidTotalByPeriodId = new Map<number, number>();
  for (const r of totalsRows) {
    paidTotalByPeriodId.set(r.payrollPeriodId, (paidTotalByPeriodId.get(r.payrollPeriodId) ?? 0) + r.totalCorePayout);
  }

  const shiftRows = await db
    .select({ date: shifts.date, status: shifts.status })
    .from(shifts)
    .where(and(gte(shifts.date, firstDay), lte(shifts.date, lastDay)));
  const shiftAgg = new Map<string, { total: number; finalized: number }>();
  for (const s of shiftRows) {
    const w = weekStartFor(s.date);
    const agg = shiftAgg.get(w) ?? { total: 0, finalized: 0 };
    agg.total += 1;
    if (s.status === "finalized") agg.finalized += 1;
    shiftAgg.set(w, agg);
  }

  const currentWeek = weekStartFor(todayIso);
  const weekSummaries: PayrollWeekSummary[] = weekStarts.map((w) => {
    const weekEnd = datesInWeek(w)[6];
    const period = periodByWeek.get(w);
    const agg = shiftAgg.get(w);
    const paid = period?.status === "paid";
    return {
      weekStart: w,
      weekEnd,
      status: paid ? "paid" : "draft",
      paidTotal: paid ? paidTotalByPeriodId.get(period!.id) ?? 0 : null,
      shiftCount: agg?.total ?? 0,
      finalizedShiftCount: agg?.finalized ?? 0,
      isCurrent: w === currentWeek,
      isFuture: w > currentWeek,
    };
  });

  return MONTH_NAMES.map((name, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const weeks = weekSummaries.filter((w) => w.weekEnd.slice(0, 7) === month);
    return {
      month,
      name,
      weeks,
      paidWeekCount: weeks.filter((w) => w.status === "paid").length,
      paidTotal: weeks.reduce((s, w) => s + (w.paidTotal ?? 0), 0),
      isCurrent: weeks.some((w) => w.isCurrent),
      isFuture: weeks.every((w) => w.isFuture),
    };
  });
}
