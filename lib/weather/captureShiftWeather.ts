/**
 * The write side of weather (2026-09-05) — the only place a permanent
 * weather row is created.
 *
 * Two callers, one rule between them: **never overwrite an existing row.**
 * Oliver's stated requirement for item 12 is that the weather on a locked
 * record must not change under it, so a second lock (after a reopen) or a
 * second backfill leaves the first answer alone. `onConflictDoNothing` is
 * what enforces that, not a check-then-insert — two managers closing Lunch
 * and Dinner at the same time would race a check.
 */

import { db } from "@/db/client";
import { shiftWeatherRecords } from "@/db/schema";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadWeatherLocation } from "./loadWeather";
import { FORECAST_PAST_DAYS, loadWindowWeather, loadWindowWeatherRange } from "./openMeteo";
import { shiftDate } from "@/lib/analytics/salesTarget";
import type { ShiftPeriod } from "./serviceWindow";

const RESTAURANT_ID = 1;

/** Records what one shift's service actually got. Returns whether a row was
 * written, and NEVER throws — the caller is `runFinalize`, and a payroll
 * record must not fail to lock because a weather server was slow. A day
 * missed here is picked up later by the Settings backfill. */
export async function captureShiftWeather(date: string, period: ShiftPeriod): Promise<boolean> {
  try {
    const location = await loadWeatherLocation();
    if (!location) return false;
    const weather = await loadWindowWeather(
      location.latitude,
      location.longitude,
      date,
      period,
      businessTodayIso()
    );
    if (!weather) return false;
    await db
      .insert(shiftWeatherRecords)
      .values({
        restaurantId: RESTAURANT_ID,
        date,
        period,
        weatherCode: weather.weatherCode,
        tempHighF: weather.tempHighF,
        tempLowF: weather.tempLowF,
        precipInches: weather.precipInches,
        capturedAt: new Date().toISOString(),
        source: "LOCK",
      })
      .onConflictDoNothing();
    return true;
  } catch (error) {
    console.error(`[weather] could not record ${date} ${period}`, error);
    return false;
  }
}

export interface BackfillResult {
  /** Services the button set out to fill. */
  attempted: number;
  /** Rows actually written. Lower than `attempted` when the weather service
   * has no data for a day — a date it does not cover, or one too recent for
   * the archive to have published. */
  written: number;
}

/** Fills in days already closed.
 *
 * TWO requests, not one, and the split is load-bearing. Open-Meteo serves the
 * last 92 days from its forecast endpoint and everything older from its
 * archive, and the archive runs about five days behind. Asking the archive
 * for a span that reaches up to yesterday returns nothing for the last few
 * days — silently, as absent rows rather than an error — so those services
 * would stay in the "missing weather" count forever while the button kept
 * reporting success. Split at the boundary and each half is asked of the
 * endpoint that actually has it.
 *
 * Within each half it is still ONE request rather than one per day: a season
 * of backfill is otherwise a few hundred round trips, slow for the manager
 * waiting on the button and rude to a free service.
 *
 * Throws on a network failure, unlike the capture above — this one is a
 * button a person pressed and is entitled to be told it did not work.
 */
export async function backfillWeather(
  days: { date: string; period: ShiftPeriod }[]
): Promise<BackfillResult> {
  if (days.length === 0) return { attempted: 0, written: 0 };
  const location = await loadWeatherLocation();
  if (!location) return { attempted: days.length, written: 0 };

  const today = businessTodayIso();
  const boundary = shiftDate(today, -FORECAST_PAST_DAYS);
  const halves = [
    days.filter((d) => d.date < boundary),
    days.filter((d) => d.date >= boundary),
  ].filter((half) => half.length > 0);

  const capturedAt = new Date().toISOString();
  let written = 0;

  for (const half of halves) {
    const dates = half.map((d) => d.date).sort();
    const range = await loadWindowWeatherRange(
      location.latitude,
      location.longitude,
      dates[0],
      dates[dates.length - 1],
      today
    );

    const rows = half
      .map(({ date, period }) => ({ date, period, weather: range.get(date)?.[period] ?? null }))
      .filter((r) => r.weather != null)
      .map((r) => ({
        restaurantId: RESTAURANT_ID,
        date: r.date,
        period: r.period,
        weatherCode: r.weather!.weatherCode,
        tempHighF: r.weather!.tempHighF,
        tempLowF: r.weather!.tempLowF,
        precipInches: r.weather!.precipInches,
        capturedAt,
        source: "BACKFILL" as const,
      }));

    // Chunked because libSQL has a bound-parameter ceiling and a year of
    // service is ~700 rows at nine parameters each.
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(shiftWeatherRecords).values(rows.slice(i, i + CHUNK)).onConflictDoNothing();
    }
    written += rows.length;
  }

  return { attempted: days.length, written };
}
