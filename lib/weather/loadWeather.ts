/**
 * The read side of weather (2026-09-05). Query half only — every rule about
 * what a code MEANS lives in wmo.ts, so a client component can render a
 * figure without importing db/client.
 *
 * The one law of this file: nothing here throws. Weather is decoration on
 * every screen that shows it — an icon next to a sales figure — and a home
 * page that 500s because a weather server hiccuped would be a far worse bug
 * than a missing icon. Every loader returns empty and logs instead.
 */

import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db/client";
import { shifts, shiftWeatherRecords, weatherLocations } from "@/db/schema";
import { businessTodayIso } from "@/lib/formatDateTime";
import { shiftDate } from "@/lib/analytics/salesTarget";
import {
  FORECAST_REVALIDATE_SECONDS,
  loadDailyForecast,
  loadWindowWeather,
  type DayForecast,
  type WindowWeather,
} from "./openMeteo";
import type { ShiftPeriod } from "./serviceWindow";
import type { WeatherRecord } from "./dayWeather";

const RESTAURANT_ID = 1;

export interface WeatherLocation {
  label: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export type { WeatherRecord } from "./dayWeather";
export { mergeDayWeather } from "./dayWeather";

/** Wrapped in React's `cache` because the home page asks for the location
 * once for the today strip and again for the week row, and the schedule asks
 * for it beside every day. One query per request, not seven. */
export const loadWeatherLocation = cache(async (): Promise<WeatherLocation | null> => {
  try {
    const [row] = await db
      .select()
      .from(weatherLocations)
      .where(eq(weatherLocations.restaurantId, RESTAURANT_ID));
    if (!row) return null;
    return {
      label: row.label,
      latitude: row.latitude,
      longitude: row.longitude,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    // A missing table is the expected shape of this failure while the
    // migration is still pending on production — the feature goes dark, the
    // rest of the app does not notice.
    console.error("[weather] could not read the saved location", error);
    return null;
  }
});

/** The forecast for a span of days, keyed by ISO date. Empty map when no
 * location is set, when the span is entirely in the past, or when the
 * service is unreachable — all three render as "no weather shown". */
export const loadForecastByDate = cache(
  async (startDate: string, endDate: string): Promise<Map<string, DayForecast>> => {
    const empty = new Map<string, DayForecast>();
    const location = await loadWeatherLocation();
    if (!location) return empty;

    // Open-Meteo's forecast endpoint reaches 16 days out and refuses a range
    // past that with a 400. Clamping here rather than letting the request
    // fail keeps a month view from losing the fortnight it CAN show.
    const today = businessTodayIso();
    const from = startDate < today ? today : startDate;
    const horizon = shiftDate(today, 15);
    const to = endDate > horizon ? horizon : endDate;
    if (from > to) return empty;

    try {
      const days = await loadDailyForecast(location.latitude, location.longitude, from, to);
      return new Map(days.map((d) => [d.date, d]));
    } catch (error) {
      console.error("[weather] forecast unavailable", error);
      return empty;
    }
  }
);

/** The forecast as a plain object, for handing to a client component.
 * A Map does not survive the server/client boundary; this is the same data
 * one step flatter. Only the days ahead are in it — see WeeklyPlanGrid's
 * `weatherByDate` for why a forecast for a past day is not shown. */
export async function loadForecastForGrid(
  startDate: string,
  endDate: string
): Promise<Record<string, { weatherCode: number; tempHighF: number | null; precipInches: number | null }>> {
  const byDate = await loadForecastByDate(startDate, endDate);
  const out: Record<string, { weatherCode: number; tempHighF: number | null; precipInches: number | null }> = {};
  for (const [date, day] of byDate) {
    out[date] = { weatherCode: day.weatherCode, tempHighF: day.tempHighF, precipInches: day.precipInches };
  }
  return out;
}

/** The frozen records for a set of dates, keyed "date|period". */
export async function loadWeatherRecordsForDates(
  dates: string[]
): Promise<Map<string, WeatherRecord>> {
  const out = new Map<string, WeatherRecord>();
  if (dates.length === 0) return out;
  try {
    const rows = await db
      .select()
      .from(shiftWeatherRecords)
      .where(
        and(
          eq(shiftWeatherRecords.restaurantId, RESTAURANT_ID),
          inArray(shiftWeatherRecords.date, dates)
        )
      );
    for (const row of rows) out.set(`${row.date}|${row.period}`, toRecord(row));
    return out;
  } catch (error) {
    console.error("[weather] could not read saved weather", error);
    return out;
  }
}

/** Same, for a continuous span — analytics reads months at a time and an
 * `IN` list of ninety dates is the wrong shape for that. */
export async function loadWeatherRecordsForRange(
  startDate: string,
  endDate: string
): Promise<Map<string, WeatherRecord>> {
  const out = new Map<string, WeatherRecord>();
  try {
    const rows = await db
      .select()
      .from(shiftWeatherRecords)
      .where(
        and(
          eq(shiftWeatherRecords.restaurantId, RESTAURANT_ID),
          gte(shiftWeatherRecords.date, startDate),
          lte(shiftWeatherRecords.date, endDate)
        )
      );
    for (const row of rows) out.set(`${row.date}|${row.period}`, toRecord(row));
    return out;
  } catch (error) {
    console.error("[weather] could not read saved weather", error);
    return out;
  }
}

/** What one service's weather looks like RIGHT NOW, for a day still open.
 * Not a record and never written: the frozen row is created at lock time.
 * On a day still running this is part observation, part forecast — which is
 * the honest answer to "how is tonight looking" and is labelled as such
 * wherever it renders. */
export const loadLiveWindowWeather = cache(
  async (date: string, period: ShiftPeriod): Promise<WindowWeather | null> => {
    const location = await loadWeatherLocation();
    if (!location) return null;
    try {
      return await loadWindowWeather(
        location.latitude,
        location.longitude,
        date,
        period,
        businessTodayIso(),
        FORECAST_REVALIDATE_SECONDS
      );
    } catch (error) {
      console.error("[weather] live weather unavailable", error);
      return null;
    }
  }
);

/** One shift's frozen weather, for its closing report. */
export async function loadWeatherRecord(
  date: string,
  period: ShiftPeriod
): Promise<WeatherRecord | null> {
  const byKey = await loadWeatherRecordsForDates([date]);
  return byKey.get(`${date}|${period}`) ?? null;
}

function toRecord(row: typeof shiftWeatherRecords.$inferSelect): WeatherRecord {
  return {
    date: row.date,
    period: row.period,
    weatherCode: row.weatherCode,
    tempHighF: row.tempHighF,
    tempLowF: row.tempLowF,
    precipInches: row.precipInches,
    source: row.source,
  };
}

/** Every finalized shift with no weather row — what the Settings backfill
 * has left to do, and the number its button reports.
 *
 * A LEFT JOIN and not two queries differenced in memory: the shift table is
 * the authority on which day-services exist, and walking a date range
 * instead would invent services on days the restaurant was closed.
 *
 * Lives here rather than in lib/actions/weather.ts on purpose. Every export
 * of a "use server" file is a publicly callable endpoint, so a loader
 * exported from there is an unauthenticated endpoint whether or not anyone
 * meant it to be — see LESSONS.md, "A use server file has no private
 * helpers". This is a plain server module; the action imports it.
 */
export async function loadShiftsMissingWeather(): Promise<{ date: string; period: ShiftPeriod }[]> {
  const rows = await db
    .select({ date: shifts.date, period: shifts.period })
    .from(shifts)
    .leftJoin(
      shiftWeatherRecords,
      and(
        eq(shiftWeatherRecords.date, shifts.date),
        eq(shiftWeatherRecords.period, shifts.period),
        eq(shiftWeatherRecords.restaurantId, RESTAURANT_ID)
      )
    )
    .where(and(eq(shifts.status, "finalized"), isNull(shiftWeatherRecords.id)));
  return rows.map((r) => ({ date: r.date, period: r.period as ShiftPeriod }));
}

/** The same count, for the Settings panel's own copy — so the button can say
 * what pressing it will do. Returns 0 on any failure, including the missing
 * table before the migration has run. */
export async function countShiftsMissingWeather(): Promise<number> {
  try {
    return (await loadShiftsMissingWeather()).length;
  } catch (error) {
    console.error("[weather] could not count services missing weather", error);
    return 0;
  }
}
