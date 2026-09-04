/**
 * Reads the two sales-target tables into the shape the pure resolver in
 * salesTarget.ts expects (2026-09-04). The query half only — every
 * decision about what a target MEANS lives in that module, so a client
 * component can import the rules without importing db/client.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { salesTargetDates, salesTargetWeekdays } from "@/db/schema";
import type { SalesTargets } from "@/lib/analytics/salesTarget";

const RESTAURANT_ID = 1;

export interface SalesTargetDateOverride {
  date: string;
  netSalesTarget: number;
  label: string | null;
}

export interface SalesTargetsForEditing {
  /** dayOfWeek (0-6) -> target, for the seven-row form. */
  weekday: Record<number, number>;
  /** Every override, oldest date first, for the list under the form. */
  dates: SalesTargetDateOverride[];
}

/** Everything, for the settings screen that edits it. */
export async function loadSalesTargetsForEditing(): Promise<SalesTargetsForEditing> {
  const [weekdayRows, dateRows] = await Promise.all([
    db.select().from(salesTargetWeekdays).where(eq(salesTargetWeekdays.restaurantId, RESTAURANT_ID)),
    db
      .select()
      .from(salesTargetDates)
      .where(eq(salesTargetDates.restaurantId, RESTAURANT_ID))
      .orderBy(asc(salesTargetDates.date)),
  ]);

  const weekday: Record<number, number> = {};
  for (const r of weekdayRows) weekday[r.dayOfWeek] = r.netSalesTarget;

  return {
    weekday,
    dates: dateRows.map((r) => ({ date: r.date, netSalesTarget: r.netSalesTarget, label: r.label })),
  };
}

/** The lookup shape, for screens that only compare days against targets.
 * Date overrides are read for the whole table rather than a range: there
 * are a handful of them by design (holidays and buyouts, not every day),
 * and a range filter here would be one more thing to keep in step with
 * whatever window the caller happens to be showing. */
export async function loadSalesTargets(): Promise<SalesTargets> {
  const { weekday, dates } = await loadSalesTargetsForEditing();
  const dateMap: Record<string, number> = {};
  for (const d of dates) dateMap[d.date] = d.netSalesTarget;
  return { weekday, dates: dateMap };
}
