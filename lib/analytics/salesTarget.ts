/**
 * Pure sales-target types and helpers (2026-09-04) — no database import,
 * deliberately, for exactly the reason laborTarget.ts records:
 * WeeklyPlanGrid is a client component, so a helper that lived beside its
 * loader would drag db/client into the browser bundle. The query half is
 * loadSalesTargets.ts; this half is shared by both sides.
 *
 * Two numbers sit beside a day's sales, and they answer different
 * questions. Keep them apart:
 *
 *   TARGET  — what the partners decided this day should do. A plan. Comes
 *             from the meeting, is typed in, and is right or wrong only in
 *             the sense that a plan is.
 *   TREND   — what this day usually does: the average of the last four
 *             same weekdays that actually had sales. An observation. Says
 *             nothing about whether anyone is happy with it.
 *
 * A day can beat its trend and miss its target, and that is the useful
 * case, not a contradiction — so neither figure is ever rendered as "the"
 * comparison and the labels always say which one is which.
 */

/** 0=Sunday..6=Saturday. Pinned to UTC noon, the same convention as
 * WeeklyPlanGrid's own dayOfWeekFor and lib/schedule/weekMath.ts: a bare
 * "YYYY-MM-DD" parses as the previous day in every negative-UTC-offset
 * timezone, which is every timezone this app runs in. */
export function dayOfWeekFor(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** ISO date `days` before `dateIso`. Same UTC-noon pin, so a DST boundary
 * cannot shift the result by a day. */
export function shiftDate(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SalesTargets {
  /** dayOfWeek (0-6) -> net sales target. Weekdays nobody set are absent,
   * never 0 — a stored 0 would mark every Monday as missed. */
  weekday: Record<number, number>;
  /** ISO date -> net sales target, beating the weekday default for that
   * one date. */
  dates: Record<string, number>;
}

export const EMPTY_SALES_TARGETS: SalesTargets = { weekday: {}, dates: {} };

/** The one resolution order, written once: a date override wins, then the
 * weekday default, then nothing. Null is "nobody set a target for this
 * day" and every caller must render it as an absent verdict rather than
 * as a target of zero. */
export function resolveSalesTarget(dateIso: string, targets: SalesTargets): number | null {
  const override = targets.dates[dateIso];
  if (override != null) return override;
  const weekday = targets.weekday[dayOfWeekFor(dateIso)];
  return weekday ?? null;
}

export type SalesVerdict = "over" | "under" | "none";

/** "none" whenever there is nothing honest to say — no target set, or no
 * sales figure for the day. Deliberately mirrors laborVerdict, including
 * the tie: exactly on target reads as "under", i.e. not a miss.
 *
 * Note the polarity is the OPPOSITE of labor: over target is good here,
 * over target is bad there. The two never share a colour helper for that
 * reason — see salesToneClass and the grid's own labor colouring. */
export function salesVerdict(netSales: number | null, target: number | null | undefined): SalesVerdict {
  if (netSales == null || target == null) return "none";
  return netSales >= target ? "over" : "under";
}

/** Signed difference in dollars, or null when there is no target. Positive
 * means above target. */
export function salesDifference(netSales: number | null, target: number | null | undefined): number | null {
  if (netSales == null || target == null) return null;
  return Math.round((netSales - target + 1e-9) * 100) / 100;
}

/** How many same-weekday days back the trend looks. Oliver's call
 * 2026-09-04, over "same weekday last week": one rainy Tuesday should not
 * be able to swing the arrow, and this is already the rule written down
 * for the forecast that comes later (competitor-DNA backlog item 7). */
export const TREND_WEEKS = 4;

export interface SalesTrend {
  /** Mean of the same weekday's net sales over the last TREND_WEEKS
   * occurrences that had any. */
  average: number;
  /** How many of those weeks actually had a figure. Below TREND_WEEKS the
   * UI must say so — "2 Tuesdays" is a different claim from "4 Tuesdays"
   * and a restaurant that opened last month has only the former. */
  weeks: number;
}

/** Average of the last TREND_WEEKS same weekdays before `dateIso`, over
 * whichever of them have a net sales figure. Returns null when none do,
 * which is the honest state for a restaurant with no history — Youk opens
 * with exactly that and must show nothing rather than a comparison
 * against zero.
 *
 * `dateIso` itself is never included: comparing a day against an average
 * that contains it flattens the very difference the trend is there to
 * show. */
export function salesTrend(dateIso: string, netSalesByDate: Record<string, number>): SalesTrend | null {
  const values: number[] = [];
  for (let week = 1; week <= TREND_WEEKS; week++) {
    const past = netSalesByDate[shiftDate(dateIso, -7 * week)];
    if (past != null) values.push(past);
  }
  if (values.length === 0) return null;
  const sum = values.reduce((a, v) => a + v, 0);
  return { average: Math.round((sum / values.length + 1e-9) * 100) / 100, weeks: values.length };
}

/** The earliest date a trend for `dateFrom` can need, so a loader knows
 * how far back to read. */
export function trendLookbackStart(dateFrom: string): string {
  return shiftDate(dateFrom, -7 * TREND_WEEKS);
}
