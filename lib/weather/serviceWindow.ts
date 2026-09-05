/**
 * The hours each service actually runs, confirmed by Oliver 2026-09-05:
 * "lunch 11-4, break, dinner 5-10 or 11".
 *
 * This is the whole reason weather is stored per period rather than per day.
 * A calendar-day summary would average a sunny lunch and a 6pm thunderstorm
 * into one unremarkable figure, and the thunderstorm is the entire point —
 * it is what a manager is trying to explain when dinner came in $1,400 short.
 *
 * Start is inclusive, end exclusive, local restaurant time. Dinner ends at 23
 * so a close at either 10 or 11 is covered; the extra hour on a 10pm night
 * costs nothing but reading one more calm hour.
 *
 * Hardcoded, not a setting: nobody has asked for per-restaurant service hours
 * and inventing a settings screen for them now would be guessing at a shape.
 * When a second restaurant needs different hours this becomes a lookup and
 * every caller already goes through serviceWindowHours().
 */

export type ShiftPeriod = "Lunch" | "Dinner";

const WINDOWS: Record<ShiftPeriod, { startHour: number; endHour: number }> = {
  Lunch: { startHour: 11, endHour: 16 },
  Dinner: { startHour: 17, endHour: 23 },
};

export function serviceWindowHours(period: ShiftPeriod): number[] {
  const { startHour, endHour } = WINDOWS[period];
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  return hours;
}

/** "11am – 4pm", for the Settings copy that explains what gets recorded. */
export function describeServiceWindow(period: ShiftPeriod): string {
  const { startHour, endHour } = WINDOWS[period];
  return `${clockLabel(startHour)} – ${clockLabel(endHour)}`;
}

function clockLabel(hour24: number): string {
  const suffix = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}${suffix}`;
}
