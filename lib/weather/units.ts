/**
 * Temperature and rainfall units (2026-09-05, Oliver: "is there option to
 * see in Celsius?").
 *
 * ONE setting, two effects: picking Celsius also switches rainfall to
 * millimetres. Metric travels together, and a screen reading "18° · 1.4
 * inches" is the kind of half-converted figure that makes a reader distrust
 * both halves. It is a single choice on purpose — two toggles would let a
 * restaurant build exactly that screen.
 *
 * STORAGE STAYS FAHRENHEIT AND INCHES, always, whatever the setting says.
 * The unit is a display preference; the stored row is a permanent record of
 * a locked service. Converting at write time would mean a restaurant that
 * changes its mind has a table with two units in it and no column saying
 * which is which — and the weather on already-locked shifts would appear to
 * change, which is the one thing item 12 exists to prevent.
 */

export type TemperatureUnit = "F" | "C";

export const DEFAULT_TEMPERATURE_UNIT: TemperatureUnit = "F";

export function isTemperatureUnit(value: unknown): value is TemperatureUnit {
  return value === "F" || value === "C";
}

/** Rounded to whole degrees in both units: nobody staffs a Saturday
 * differently for half a degree, and a decimal on a weather figure sitting
 * beside a dollar amount reads as precision that is not there. */
export function displayTemperature(fahrenheit: number, unit: TemperatureUnit): number {
  return Math.round(unit === "C" ? ((fahrenheit - 32) * 5) / 9 : fahrenheit);
}

/** Inches to millimetres. Millimetres go to whole numbers and inches to one
 * decimal, because that is where each unit's useful resolution sits: 0.1" is
 * a shower worth noticing, 0.1mm is nothing at all. */
export function displayPrecipitation(
  inches: number,
  unit: TemperatureUnit
): { value: number; suffix: string } {
  if (unit === "C") return { value: Math.round(inches * 25.4), suffix: "mm" };
  return { value: Math.round(inches * 10) / 10, suffix: '"' };
}

/** Below this there is nothing worth printing — a damp pavement, not a
 * reason a service was quiet. Expressed in inches, the stored unit, so the
 * threshold is the same weather in both settings rather than two different
 * amounts of rain depending on which one you picked. */
export const PRECIPITATION_FLOOR_INCHES = 0.05;
