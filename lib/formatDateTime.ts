/** Deterministic timestamp formatting, shared app-wide (2026-08-21).
 *
 * `Date.prototype.toLocaleString()`/`toLocaleDateString()` called with no
 * explicit locale+timeZone resolve against the *runtime's* default locale
 * and timezone. In this app that runtime differs between the Node server
 * (renders the page first) and the browser (hydrates it) -- so the exact
 * same Date can print two different strings in the same page load, which
 * React reports as a hydration mismatch (minified error #418: "text
 * content does not match server-rendered HTML"). Found live on
 * `/ledger/day`'s "Finalized {date} by {name}" line during the 2026-08-21
 * visual-audit -- reproduced at both desktop and mobile viewport, on every
 * load of a finalized reconciliation.
 *
 * This is a different problem from the app's existing UTC-anchored
 * calendar-date helpers (see lib/schedule/weekMath.ts and the various
 * `monthLabel`/`weekLabel` functions across app/) -- those intentionally
 * format a plain YYYY-MM-DD calendar date at noon UTC so it never shifts
 * across a DST boundary, and that convention is correct and untouched
 * here. This helper is for a real wall-clock timestamp (when something
 * was finalized/printed/delivered) where the point IS to show the actual
 * local time it happened -- UTC would just show the wrong hour to a
 * restaurant-floor user. */

/** Youk Thai (Atlas's only restaurant so far) is NYC-based -- see the
 * seeded 8.875% NYC sales tax rate in restaurant_settings
 * (project_atlas_target_users_accessibility.md flag 1). If Atlas ever
 * serves a restaurant outside this timezone, this needs to become a
 * per-restaurant setting, not a global constant -- flagged here so it's
 * not silently wrong for a future second location. */
export const RESTAURANT_TIMEZONE = "America/New_York";

/** Full date + time, e.g. "8/14/2026, 6:09:06 AM" -- always the same
 * string on server and client. Use for "when did this happen" timestamps
 * (finalized/printed/delivered/logged). */
export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("en-US", { timeZone: RESTAURANT_TIMEZONE });
}

/** Short date only, e.g. "Aug 14" -- for contexts that don't need the
 * time (e.g. "Paid on Aug 14"). */
export function formatShortDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: RESTAURANT_TIMEZONE });
}
