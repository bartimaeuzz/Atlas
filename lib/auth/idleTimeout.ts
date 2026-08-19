/**
 * Pure date-math for the 30-minute inactivity auto-logout (confirmed
 * 2026-08-18, see project memory "Atlas Session Security"). Deliberately
 * has no `next/headers` or DB import so it's safe to import from BOTH
 * server-only code (lib/auth/session.ts) and a client component
 * (app/SessionIdleWarning.tsx) — a client bundle pulling in `next/headers`
 * transitively would fail to build. Keeping the constants here too (not
 * duplicated) is what lets the client's warning threshold and the
 * server's actual cutoff stay in sync by construction.
 */

/** All roles, one rule (confirmed via AskUserQuestion 2026-08-18) — this
 * is a shared restaurant terminal, so 30 minutes idle signs everyone out
 * regardless of Staff/Manager/Admin. Sits alongside the existing 14h hard
 * cap (SESSION_DURATION_MS in session.ts) as a tighter, resettable bound;
 * whichever limit is hit first ends the session. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** How long before the idle cutoff the client shows its "you'll be signed
 * out soon" warning banner. Purely a UX heads-up — the server enforces
 * the real cutoff at IDLE_TIMEOUT_MS regardless of whether this banner
 * was ever seen (e.g. tab not in focus, JS disabled). */
export const IDLE_WARNING_MS = 60 * 1000;

/** Don't write lastActivityAt on literally every authenticated request —
 * only once this much time has passed since the value already on the
 * row, so normal browsing doesn't turn into a DB write per request. Purely
 * a write-volume optimization: it shrinks the window between "last real
 * activity" and "what the row says" by at most this amount, which is
 * negligible against a 30-minute timeout. */
export const ACTIVITY_TOUCH_THROTTLE_MS = 60 * 1000;

/** True once `now` is at or past the idle cutoff for a session last
 * active at `lastActivityAt`. This is the actual enforcement check —
 * resolveSessionToken in session.ts calls this (via idleCutoffIso) on
 * every request; nothing client-side can grant extra time on its own. */
export function isIdleExpired(lastActivityAt: Date, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= IDLE_TIMEOUT_MS;
}

/** The SQL-comparable cutoff instant: a session is still within its idle
 * window only if lastActivityAt is AFTER this. */
export function idleCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_TIMEOUT_MS);
}

/** Throttle check for the write side — see ACTIVITY_TOUCH_THROTTLE_MS. */
export function shouldTouchActivity(lastActivityAt: Date, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() > ACTIVITY_TOUCH_THROTTLE_MS;
}

/** Milliseconds remaining until idle logout, clamped to 0 (never
 * negative) — what the client's polling status action reports back for
 * the countdown display. */
export function msUntilIdleTimeout(lastActivityAt: Date, now: Date): number {
  return Math.max(0, IDLE_TIMEOUT_MS - (now.getTime() - lastActivityAt.getTime()));
}
