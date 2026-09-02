/**
 * How long a sign-in lasts (2026-09-01, Oliver: "keep me signed in = 30
 * days on a personal device; shared terminal keeps its 30-min idle / 14h
 * window unchanged"). Pure date-math, no DB or next/headers import, same
 * reasoning as idleTimeout.ts — safe from server code and client bundles.
 *
 * Two lifetimes, chosen by the "This is my own phone" box on /login:
 *   - shared device (box off, the default): 14h hard cap AND the 30-min
 *     idle sign-out in idleTimeout.ts, whichever comes first.
 *   - own device (box on): 30 days, no idle sign-out. A phone in someone's
 *     pocket is not a terminal the next person walks up to.
 * Either kind ends early on Sign out, and (Oliver, same day) on a PIN
 * reset for that person — "they need to log in again because they reset
 * the password".
 */

export const SHARED_DEVICE_SESSION_MS = 14 * 60 * 60 * 1000;
export const OWN_DEVICE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionDurationMs(ownDevice: boolean): number {
  return ownDevice ? OWN_DEVICE_SESSION_MS : SHARED_DEVICE_SESSION_MS;
}

export function sessionExpiresAt(now: Date, ownDevice: boolean): Date {
  return new Date(now.getTime() + sessionDurationMs(ownDevice));
}

/** For the cookie's maxAge — whole seconds, matching the row's expiry so
 * the browser forgets the token at the same moment the server would
 * refuse it. */
export function sessionCookieMaxAgeSeconds(ownDevice: boolean): number {
  return Math.floor(sessionDurationMs(ownDevice) / 1000);
}
