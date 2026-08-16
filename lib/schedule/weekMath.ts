/** Shared week-boundary math for the Schedule Planner — pulled out into
 * its own file since the same "pinned to UTC noon" date parsing and
 * Monday-start week logic (already used ad hoc in app/reports/page.tsx
 * and app/me/MyEarningsView.tsx) is needed in three places here: the
 * weekly plan loader, the weekly plan actions, and createShift's
 * auto-seed hook in lib/actions/shift.ts. Pinning to UTC noon avoids the
 * classic "YYYY-MM-DD parses as the previous day" bug in negative-UTC-
 * offset timezones — see those other files' comments for the same fix. */

export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mostRecentMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffToMonday);
  return monday;
}

/** ISO date string of the Monday starting the week that `dateIso` falls
 * in. Weeks in this feature always run Monday-Sunday, matching the
 * Reports/My Pay convention elsewhere in the app. */
export function weekStartFor(dateIso: string): string {
  return toIso(mostRecentMonday(parseDate(dateIso)));
}

/** Given a week's Monday start date and a JS-convention day-of-week
 * (0=Sunday..6=Saturday, matching employeeScheduleTemplates.dayOfWeek),
 * returns the ISO date string for that day within the week. */
export function dateForDayOfWeek(weekStartDateIso: string, dayOfWeek: number): string {
  const offsetFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = parseDate(weekStartDateIso);
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + offsetFromMonday);
  return toIso(d);
}

/** The seven ISO dates (Monday..Sunday) in the week starting at
 * weekStartDateIso, in order. */
export function datesInWeek(weekStartDateIso: string): string[] {
  const monday = parseDate(weekStartDateIso);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return toIso(d);
  });
}

/** weekStartDateIso shifted by N weeks (negative = earlier) — for the
 * plan page's prev/next week navigation. */
export function shiftWeek(weekStartDateIso: string, weeks: number): string {
  const d = parseDate(weekStartDateIso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return toIso(d);
}

/** dateIso shifted by N days (negative = earlier) — used by the month
 * overview to walk the calendar grid and by prev/next month nav. */
export function addDays(dateIso: string, days: number): string {
  const d = parseDate(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** ISO date string for the 1st of the month dateIso falls in. */
export function monthStart(dateIso: string): string {
  const d = parseDate(dateIso);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
}

/** dateIso's month shifted by N months (negative = earlier), pinned to
 * the 1st — for the month overview's prev/next navigation. */
export function shiftMonth(dateIso: string, months: number): string {
  const d = parseDate(dateIso);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12)));
}

/** Human label for the month dateIso falls in, e.g. "August 2026". */
export function monthLabel(dateIso: string): string {
  const d = parseDate(dateIso);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

/** 0=Sunday..6=Saturday for dateIso, same UTC-noon-pinned convention as
 * everything else in this file. */
export function dayOfWeek(dateIso: string): number {
  return parseDate(dateIso).getUTCDay();
}

/** Whole days from fromIso to toIso (positive if toIso is later) --
 * added 2026-08-16 for the shift-swap approval-window rule ("<=3 days
 * before shift occur" needs manager approval, further out doesn't).
 * Same UTC-noon-pinned parseDate as everything else here, so this is
 * safe across DST/timezone edge cases. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = parseDate(toIso).getTime() - parseDate(fromIso).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
