import { WeatherIcon } from "./WeatherIcon";
import { weatherMeaning } from "@/lib/weather/wmo";
import {
  DEFAULT_TEMPERATURE_UNIT,
  PRECIPITATION_FLOOR_INCHES,
  displayPrecipitation,
  displayTemperature,
  type TemperatureUnit,
} from "@/lib/weather/units";

/** One day's or one service's weather, everywhere it appears (2026-09-05).
 * Four densities of the same figure, in one file for the same reason
 * LaborFigure is: five screens show this, and five copies would drift into
 * saying it five ways.
 *
 *   "row"    — inline beside a date or a dollar figure. Icon, temperature,
 *              and rain only when there is rain to report.
 *   "column" — stacked, for the home page's seven-day strip.
 *   "detail" — icon, the condition in WORDS, temperature and rain. The
 *              closing report, where there is room to be explicit.
 *   "banner" — the same detail at size, for the top of an open day.
 *
 * COLOUR RULES, both inherited from the labor figure on these same screens:
 * severe weather is the only thing coloured — painting every pleasant day
 * would make the storm harder to find, not easier — and colour never carries
 * the meaning alone. In "row" and "column", where the condition is not
 * spelled out, the whole figure carries an aria-label that says it in words.
 */
export interface WeatherFigureData {
  weatherCode: number;
  tempHighF: number | null;
  tempLowF?: number | null;
  precipInches: number | null;
}

export function WeatherFigure({
  weather,
  variant = "row",
  unit = DEFAULT_TEMPERATURE_UNIT,
  className = "",
}: {
  weather: WeatherFigureData;
  variant?: "row" | "column" | "detail" | "banner";
  /** Display units, from the restaurant's weather setting. The DATA is
   * always Fahrenheit and inches — see lib/weather/units.ts for why the
   * conversion lives here and not at write time. */
  unit?: TemperatureUnit;
  className?: string;
}) {
  const meaning = weatherMeaning(weather.weatherCode);
  const temp = formatTemp(weather.tempHighF, unit);
  const rain = formatPrecip(weather.precipInches, unit);
  const tone = meaning.severe ? "text-[var(--danger-700)] font-medium" : "text-[var(--ink-500)]";
  // Spoken form for the two dense variants, which show figures without the
  // condition in words. Built from the parts rather than by patching the
  // rendered string: "18°C" and "36mm" have nothing in common to replace.
  const spoken = [
    meaning.label,
    weather.tempHighF != null && `${displayTemperature(weather.tempHighF, unit)} degrees`,
    rain && `${rain.replace(/["]|mm/, "")} ${unit === "C" ? "millimetres" : "inches"} of rain`,
  ]
    .filter(Boolean)
    .join(", ");

  if (variant === "column") {
    return (
      <span className={`flex flex-col items-center leading-tight ${tone} ${className}`} aria-label={spoken}>
        <WeatherIcon name={meaning.icon} size={20} />
        <span className="text-xs mt-0.5 text-[var(--ink-900)]">{temp || "—"}</span>
        {/* A blank line, not a missing one: without it the dry days are a
            pixel shorter than the wet one and the row of seven sits crooked. */}
        <span className="text-xs">{rain || " "}</span>
      </span>
    );
  }

  if (variant === "detail" || variant === "banner") {
    const iconSize = variant === "banner" ? 26 : 18;
    return (
      <span className={`inline-flex items-center gap-2 ${tone} ${className}`}>
        <WeatherIcon name={meaning.icon} size={iconSize} />
        {/* nowrap: at 390px this line broke after the "·", stranding the
            separator at the end of one line and the temperature on the next
            (live audit 2026-09-05, home page). It is short enough to keep
            whole at every width the app supports. */}
        <span className={"whitespace-nowrap " + (variant === "banner" ? "text-sm" : "text-xs")}>
          {[meaning.label, temp, rain].filter(Boolean).join(" · ")}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${tone} ${className}`} aria-label={spoken}>
      <WeatherIcon name={meaning.icon} size={16} />
      <span>{[temp, rain].filter(Boolean).join(" ") || meaning.label}</span>
    </span>
  );
}

function formatTemp(fahrenheit: number | null | undefined, unit: TemperatureUnit): string {
  return fahrenheit == null ? "" : `${displayTemperature(fahrenheit, unit)}°`;
}

/** Below a twentieth of an inch is a damp pavement, not a reason a service
 * was quiet, and printing 0.0" next to every dry day is noise. The floor is
 * checked in INCHES, the stored unit, so the same weather is hidden in both
 * settings rather than two different amounts of rain depending on the one
 * you picked. */
function formatPrecip(inches: number | null | undefined, unit: TemperatureUnit): string {
  if (inches == null || inches < PRECIPITATION_FLOOR_INCHES) return "";
  const { value, suffix } = displayPrecipitation(inches, unit);
  if (value <= 0) return "";
  return unit === "C" ? `${value}${suffix}` : `${value.toFixed(1)}${suffix}`;
}
