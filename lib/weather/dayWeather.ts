/**
 * Day-level weather shaping, with no database import — deliberately, the same
 * reason salesTarget.ts is split from loadSalesTargets.ts: this is the half a
 * unit test and a client component can both read, and dragging db/client into
 * either is what that split exists to prevent.
 */

import { worstWeatherCode } from "./wmo";
import type { ShiftPeriod } from "./serviceWindow";

export interface WeatherRecord {
  date: string;
  period: ShiftPeriod;
  weatherCode: number;
  tempHighF: number | null;
  tempLowF: number | null;
  precipInches: number | null;
  /** How this row came to exist. LOCK was stamped as the shift was closed;
   * BACKFILL was looked up later from Settings. The two are equally true
   * about the weather and NOT equally true about the record, so the caption
   * on a closing report says which one the reader is looking at rather than
   * claiming every row was recorded at close. */
  source: "LOCK" | "BACKFILL";
}

/** A whole day's weather from its services, for a screen whose row is a day
 * rather than a service — analytics compares a DAY's sales to a DAY's target,
 * so a row cannot carry two skies.
 *
 * The reduction is "the worst of it", the same rule used to pick one hour out
 * of a service window: a manager explaining a bad Saturday means the
 * thunderstorm, not the average of a calm lunch and a thunderstorm. Rain is
 * summed because both services' rain fell on the same day; temperature takes
 * the day's own high and low across the services.
 */
export function mergeDayWeather(records: WeatherRecord[]): WeatherRecord | null {
  if (records.length === 0) return null;
  if (records.length === 1) return records[0];
  const code = worstWeatherCode(records.map((r) => r.weatherCode));
  if (code == null) return null;
  const highs = records.map((r) => r.tempHighF).filter((t): t is number => t != null);
  const lows = records.map((r) => r.tempLowF).filter((t): t is number => t != null);
  const rains = records.map((r) => r.precipInches).filter((p): p is number => p != null);
  return {
    date: records[0].date,
    // The period this merged figure belongs to is no longer a single
    // service, and no caller reads it — but a lie is worse than a repeat,
    // so it keeps the period of the service the worst sky came from.
    period: records.find((r) => r.weatherCode === code)!.period,
    weatherCode: code,
    tempHighF: highs.length ? Math.max(...highs) : null,
    tempLowF: lows.length ? Math.min(...lows) : null,
    precipInches: rains.length ? Math.round(rains.reduce((a, b) => a + b, 0) * 100) / 100 : null,
    // A merged day is only "recorded at close" if BOTH its services were.
    source: records.every((r) => r.source === "LOCK") ? "LOCK" : "BACKFILL",
  };
}
