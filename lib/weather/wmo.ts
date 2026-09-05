/**
 * WMO weather interpretation codes -> the words and the icon Mohom shows.
 *
 * Open-Meteo returns a bare integer for both forecast and history, so this
 * file is the single place the number becomes something a manager reads.
 * Kept as data, not scattered switch statements, because the same code has
 * to render identically on five different screens.
 *
 * `severe` is the only judgement here, and it is deliberately narrow: heavy
 * rain, heavy snow, freezing anything, and thunderstorms. It is what turns
 * the figure red and bold on the schedule and in analytics. Cold alone is
 * not severe — a 20° January Tuesday is just winter in New York, and
 * colouring every winter day would make the storm impossible to find. Same
 * "colour only when it is the exception" rule the labor figure follows.
 */

export type WeatherIconName =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "storm";

export interface WeatherMeaning {
  /** Sentence-case, short enough to sit on one line next to a dollar figure. */
  label: string;
  icon: WeatherIconName;
  severe: boolean;
}

const CODES: Record<number, WeatherMeaning> = {
  0: { label: "Clear", icon: "clear", severe: false },
  1: { label: "Mostly clear", icon: "clear", severe: false },
  2: { label: "Partly cloudy", icon: "partly", severe: false },
  3: { label: "Overcast", icon: "cloudy", severe: false },
  45: { label: "Fog", icon: "fog", severe: false },
  48: { label: "Freezing fog", icon: "fog", severe: true },
  51: { label: "Light drizzle", icon: "drizzle", severe: false },
  53: { label: "Drizzle", icon: "drizzle", severe: false },
  55: { label: "Heavy drizzle", icon: "drizzle", severe: false },
  56: { label: "Freezing drizzle", icon: "drizzle", severe: true },
  57: { label: "Freezing drizzle", icon: "drizzle", severe: true },
  61: { label: "Light rain", icon: "rain", severe: false },
  63: { label: "Rain", icon: "rain", severe: false },
  65: { label: "Heavy rain", icon: "rain", severe: true },
  66: { label: "Freezing rain", icon: "rain", severe: true },
  67: { label: "Freezing rain", icon: "rain", severe: true },
  71: { label: "Light snow", icon: "snow", severe: false },
  73: { label: "Snow", icon: "snow", severe: true },
  75: { label: "Heavy snow", icon: "snow", severe: true },
  77: { label: "Snow grains", icon: "snow", severe: false },
  80: { label: "Light showers", icon: "rain", severe: false },
  81: { label: "Showers", icon: "rain", severe: false },
  82: { label: "Heavy showers", icon: "rain", severe: true },
  85: { label: "Snow showers", icon: "snow", severe: false },
  86: { label: "Heavy snow showers", icon: "snow", severe: true },
  95: { label: "Thunderstorm", icon: "storm", severe: true },
  96: { label: "Thunderstorm, hail", icon: "storm", severe: true },
  99: { label: "Thunderstorm, hail", icon: "storm", severe: true },
};

/** An unknown code is not an error and must not blank the screen — every
 * caller gets something renderable back. Overcast is the honest neutral:
 * it claims nothing and is never coloured. */
const UNKNOWN: WeatherMeaning = { label: "Unknown", icon: "cloudy", severe: false };

export function weatherMeaning(code: number | null | undefined): WeatherMeaning {
  if (code == null) return UNKNOWN;
  return CODES[code] ?? UNKNOWN;
}

/** Which of several hourly codes represents the window. Not an average and
 * not the mode: the worst hour is what a manager remembers and what actually
 * moved the sales, so a single 6pm thunderstorm beats four calm hours. */
export function worstWeatherCode(codes: number[]): number | null {
  if (codes.length === 0) return null;
  let worst = codes[0];
  for (const code of codes) {
    if (severityRank(code) > severityRank(worst)) worst = code;
  }
  return worst;
}

/** Higher is worse. Built from the code families rather than the raw number
 * because the WMO scale is not monotonic — 80 (light showers) is milder than
 * 65 (heavy rain), so comparing integers directly would pick the wrong hour. */
function severityRank(code: number): number {
  const meaning = weatherMeaning(code);
  const base: Record<WeatherIconName, number> = {
    clear: 0,
    partly: 1,
    cloudy: 2,
    fog: 3,
    drizzle: 4,
    rain: 5,
    snow: 6,
    storm: 7,
  };
  return base[meaning.icon] * 2 + (meaning.severe ? 1 : 0);
}
