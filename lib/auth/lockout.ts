/**
 * Wrong-credential lockout (2026-09-01, Oliver: "5 wrong tries -> 15 min,
 * same shape as recovery"). One pure rule shared by the two places a
 * person can guess at a secret without a session: the /login PIN box
 * (per employee, employees.loginFailedAttempts / loginLockedUntil) and
 * the /login/recover code box (per restaurant, restaurantSettings.
 * recoveryFailedAttempts / recoveryLockedUntil). Both stores carry the
 * same two fields; this module decides, the actions persist.
 *
 * Shape, deliberately simple: the counter resets to 0 the moment a
 * lockout starts, so once the window passes the person has a fresh set
 * of tries. The window is the only thing standing between a locked-out
 * guesser and the next batch -- the same trade every plain lockout
 * scheme makes, and enough for a 4-8 digit PIN on a restaurant terminal.
 */

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  failedAttempts: number;
  /** ISO timestamp; null or in the past = not locked. */
  lockedUntil: string | null;
}

/** Whole minutes remaining on an active lockout, or 0 when not locked.
 * Always rounds UP so a message never says "0 minutes" while still
 * refusing -- and never promises a minute less than the real wait. */
export function lockoutMinutesLeft(state: LockoutState, now: Date): number {
  if (!state.lockedUntil) return 0;
  const until = new Date(state.lockedUntil).getTime();
  if (Number.isNaN(until) || until <= now.getTime()) return 0;
  return Math.ceil((until - now.getTime()) / 60000);
}

/** The stored state after one more wrong try. Returns `locked: true` on
 * the try that crosses the threshold, with the counter already reset. */
export function recordFailedAttempt(state: LockoutState, now: Date): { next: LockoutState; locked: boolean } {
  const attempts = state.failedAttempts + 1;
  if (attempts >= LOCKOUT_THRESHOLD) {
    return {
      next: { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString() },
      locked: true,
    };
  }
  return { next: { failedAttempts: attempts, lockedUntil: state.lockedUntil }, locked: false };
}

/** The stored state after a correct try, or after the secret itself is
 * replaced (a PIN reset makes the old guesses meaningless). */
export const CLEARED_LOCKOUT: LockoutState = { failedAttempts: 0, lockedUntil: null };

export function formatMinutes(n: number): string {
  return `${n} minute${n === 1 ? "" : "s"}`;
}
