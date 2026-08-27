/** Weekday-prefixed date label for on-screen tables (2026-08-22, Oliver's
 * ask: "i live date output to show day as well. it easier for human to scan
 * through thousands of data").
 *
 * Returns e.g. "Mon 2026-08-22" — weekday for scanning, ISO date kept intact
 * so the on-screen value still matches what the .xlsx export and the DB row
 * carry. Exports deliberately unchanged (Oliver's call): the accountant
 * reconciles against a fixed layout.
 *
 * The weekday comes from a hardcoded table rather than
 * `toLocaleDateString()` on purpose. Every locale-aware formatter Atlas has
 * used has eventually produced a server/client hydration mismatch (the
 * 2026-08-21 Analytics `toLocaleString(undefined, …)` fix, and the
 * `Date#toLocaleString()` fix the same day). The input is parsed at UTC noon
 * for the same reason MyEarningsView.tsx does: a bare "YYYY-MM-DD" parses as
 * the previous day in negative-UTC-offset timezones, which is every timezone
 * this app runs in.
 */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${WEEKDAYS[d.getUTCDay()]} ${isoDate}`;
}

/** Weekday alone — for the phone cards, where the ISO date is already the
 *  card title and repeating it in a field would be noise. */
export function weekdayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getUTCDay()];
}

/** "Thursday, 1 January 2026" — the Reports/shift-page heading's long form.
 * Full 4-digit year (2026-08-27 audit: the old 2-digit "23 Aug 26" let
 * "Aug 26" read as the date itself). Same UTC-noon pin as formatDayLabel
 * above. */
export function formatDayLabelLong(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday}, ${day} ${month} ${d.getUTCFullYear()}`;
}

/** "Thu, 1 Jan 2026" — the same heading's phone form. */
export function formatDayLabelShort(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${weekday}, ${day} ${month} ${d.getUTCFullYear()}`;
}

/** "12 May 1990" — dates of birth and other person-dates. Full year (a
 * birth year matters), no weekday (nobody cares what day of the week it
 * was). Same UTC-noon pin as everything above. */
export function formatPersonDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = d.getUTCDate();
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${day} ${month} ${d.getUTCFullYear()}`;
}
