/**
 * Open-Meteo client (2026-09-05). Chosen over every paid weather API for one
 * reason above accuracy: it needs no API key, so there is no credential for
 * anyone to paste, store, rotate or leak — charter rule 3 stops being a risk
 * on this feature rather than being managed on it. Free for non-commercial
 * use under CC BY 4.0; the attribution sits in the Settings copy.
 *
 * Three endpoints, and the split between them is not cosmetic:
 *
 *   geocoding  — turns "Brooklyn" into coordinates ONCE, in Settings.
 *   forecast   — days from 92 back to 16 ahead. Serves both the live forecast
 *                and the lock-time capture, because a shift is finalized on
 *                the day it happened or a few days later.
 *   archive    — anything older, for a backfill of a season already gone.
 *
 * Every function here throws on failure and catches nothing. That is
 * deliberate: the callers decide what a failure means, and for the two that
 * matter it means "carry on" — finalizing a shift must never fail because a
 * weather server was slow (see captureShiftWeather), and a home page must
 * never 500 because of a sky icon (see loadForecast).
 */

import { RESTAURANT_TIMEZONE } from "@/lib/formatDateTime";
// The app already has exactly one correct ISO-date-arithmetic helper, pinned
// to UTC noon so a DST boundary cannot shift a day. Importing it beats
// writing a second one that is subtly different.
import { shiftDate } from "@/lib/analytics/salesTarget";
import { serviceWindowHours, type ShiftPeriod } from "./serviceWindow";
import { worstWeatherCode } from "./wmo";

/** Open-Meteo's own documented limit for the forecast endpoint's past window.
 * Exported because the backfill has to split its request on exactly this
 * boundary — see backfillWeather. */
export const FORECAST_PAST_DAYS = 92;

/** Nothing here is worth making a manager wait for. Every caller degrades to
 * showing no weather, so a slow server costs an icon, never a page. */
const TIMEOUT_MS = 6000;

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
}

export interface WindowWeather {
  weatherCode: number;
  tempHighF: number | null;
  tempLowF: number | null;
  precipInches: number | null;
}

export interface DayForecast {
  date: string;
  weatherCode: number;
  tempHighF: number | null;
  tempLowF: number | null;
  precipInches: number | null;
}

/** `revalidateSeconds` is how long Next may serve this answer from its own
 * cache. The forecast passes half an hour — a manager planning Saturday does
 * not need the sky re-checked on every page view, and Open-Meteo's free tier
 * is a courtesy worth not abusing. The lock-time capture and the backfill
 * pass nothing and always hit the network: those write a permanent record and
 * must not inherit a stale answer from somebody else's page load. */
async function getJson(url: string, revalidateSeconds?: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...(revalidateSeconds == null
        ? { cache: "no-store" as const }
        : { next: { revalidate: revalidateSeconds } }),
    });
    if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Half an hour. Long enough that a busy terminal is not re-fetching the sky
 * all afternoon, short enough that a storm arriving is visible the same
 * service. */
export const FORECAST_REVALIDATE_SECONDS = 1800;

/** Place search for the Settings picker. US-only: Mohom is a US product and
 * an unfiltered search for "Springfield" is a list of thirty countries. */
export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name: trimmed,
      count: "8",
      language: "en",
      format: "json",
      countryCode: "US",
    });
  // A place search is a person typing and waiting; a cached answer to
  // somebody else's search would be a wrong list, not a fast one.
  const data = (await getJson(url)) as {
    results?: { name?: string; admin1?: string; latitude?: number; longitude?: number }[];
  };
  const results = data.results ?? [];
  return results
    .filter((r) => typeof r.latitude === "number" && typeof r.longitude === "number" && r.name)
    .map((r) => ({
      // "Brooklyn, New York" — the state is what tells two identically named
      // towns apart, and it is the only disambiguator a manager will read.
      label: r.admin1 ? `${r.name}, ${r.admin1}` : String(r.name),
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    }));
}

interface HourlyPayload {
  hourly?: { time?: string[]; temperature_2m?: (number | null)[]; precipitation?: (number | null)[]; weather_code?: (number | null)[] };
}

/** Hourly readings for a date range, from whichever endpoint covers it.
 * Returns a map of ISO date -> the hours of that date, so a caller can slice
 * out a service window without re-parsing timestamps. */
async function loadHourly(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  todayIso: string,
  cacheSeconds?: number
): Promise<Map<string, { hour: number; tempF: number | null; precipIn: number | null; code: number | null }[]>> {
  const oldestForecastDate = shiftDate(todayIso, -FORECAST_PAST_DAYS);
  const useArchive = startDate < oldestForecastDate;
  const base = useArchive
    ? "https://archive-api.open-meteo.com/v1/archive?"
    : "https://api.open-meteo.com/v1/forecast?";
  const url =
    base +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: startDate,
      end_date: endDate,
      hourly: "temperature_2m,precipitation,weather_code",
      temperature_unit: "fahrenheit",
      precipitation_unit: "inch",
      timezone: RESTAURANT_TIMEZONE,
    });

  const data = (await getJson(url, cacheSeconds)) as HourlyPayload;
  const times = data.hourly?.time ?? [];
  const temps = data.hourly?.temperature_2m ?? [];
  const precip = data.hourly?.precipitation ?? [];
  const codes = data.hourly?.weather_code ?? [];

  const byDate = new Map<string, { hour: number; tempF: number | null; precipIn: number | null; code: number | null }[]>();
  times.forEach((stamp, i) => {
    // Open-Meteo returns local time as "2026-09-13T18:00" because we asked
    // for the restaurant's timezone — string slicing is correct here and a
    // Date parse would drag the server's own zone back into it.
    const date = stamp.slice(0, 10);
    const hour = Number(stamp.slice(11, 13));
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      hour,
      tempF: temps[i] ?? null,
      precipIn: precip[i] ?? null,
      code: codes[i] ?? null,
    });
  });
  return byDate;
}

/** The weather one service actually had. Reduces the window's hours the way
 * a person would describe them: the worst sky, the highest and lowest it got,
 * and every drop that fell added together. */
export async function loadWindowWeather(
  latitude: number,
  longitude: number,
  date: string,
  period: ShiftPeriod,
  todayIso: string,
  /** Left unset by the lock-time capture and the backfill — a permanent
   * record must not inherit somebody else's cached answer. Set by the
   * live display on an open day, which is only decoration. */
  cacheSeconds?: number
): Promise<WindowWeather | null> {
  const byDate = await loadHourly(latitude, longitude, date, date, todayIso, cacheSeconds);
  return windowFromHours(byDate.get(date) ?? [], period);
}

/** Same reduction for several days at once — one request instead of fourteen,
 * which is what makes the backfill button finish in a reasonable time. */
export async function loadWindowWeatherRange(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string,
  todayIso: string
): Promise<Map<string, Record<ShiftPeriod, WindowWeather | null>>> {
  const byDate = await loadHourly(latitude, longitude, startDate, endDate, todayIso);
  const out = new Map<string, Record<ShiftPeriod, WindowWeather | null>>();
  for (const [date, hours] of byDate) {
    out.set(date, {
      Lunch: windowFromHours(hours, "Lunch"),
      Dinner: windowFromHours(hours, "Dinner"),
    });
  }
  return out;
}

/** Exported for its unit test (2026-09-05). The three reductions in here —
 * worst sky, high and low, rain summed — are the only real logic in this
 * file; everything around them is URL building. */
export function windowFromHours(
  hours: { hour: number; tempF: number | null; precipIn: number | null; code: number | null }[],
  period: ShiftPeriod
): WindowWeather | null {
  const wanted = new Set(serviceWindowHours(period));
  const inWindow = hours.filter((h) => wanted.has(h.hour));
  if (inWindow.length === 0) return null;

  const codes = inWindow.map((h) => h.code).filter((c): c is number => c != null);
  const code = worstWeatherCode(codes);
  if (code == null) return null;

  const temps = inWindow.map((h) => h.tempF).filter((t): t is number => t != null);
  const precips = inWindow.map((h) => h.precipIn).filter((p): p is number => p != null);

  return {
    weatherCode: code,
    tempHighF: temps.length ? Math.max(...temps) : null,
    tempLowF: temps.length ? Math.min(...temps) : null,
    // Summed, not averaged: an inch of rain over five hours is an inch of
    // rain. Rounded to hundredths so a float artefact never reaches a screen.
    precipInches: precips.length ? Math.round(precips.reduce((a, b) => a + b, 0) * 100) / 100 : null,
  };
}

/** Whole-day forecast for the days ahead — the home page's week row and the
 * schedule grid. Daily figures, not windowed: a day nobody has worked yet is
 * a planning question ("is Saturday going to be wet"), not a record. */
export async function loadDailyForecast(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<DayForecast[]> {
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      start_date: startDate,
      end_date: endDate,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      temperature_unit: "fahrenheit",
      precipitation_unit: "inch",
      timezone: RESTAURANT_TIMEZONE,
    });
  const data = (await getJson(url, FORECAST_REVALIDATE_SECONDS)) as {
    daily?: {
      time?: string[];
      weather_code?: (number | null)[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
      precipitation_sum?: (number | null)[];
    };
  };
  const times = data.daily?.time ?? [];
  return times
    .map((date, i) => ({
      date,
      weatherCode: data.daily?.weather_code?.[i] ?? null,
      tempHighF: data.daily?.temperature_2m_max?.[i] ?? null,
      tempLowF: data.daily?.temperature_2m_min?.[i] ?? null,
      precipInches: data.daily?.precipitation_sum?.[i] ?? null,
    }))
    .filter((d): d is DayForecast => d.weatherCode != null);
}
