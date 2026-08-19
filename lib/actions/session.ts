"use server";

/** Backs the idle-timeout warning banner (app/SessionIdleWarning.tsx) — a
 * client component, so it can't read the httpOnly session cookie or query
 * the DB directly. Two thin actions: a read-only poll and an explicit
 * extend. See lib/auth/session.ts's peekSessionIdleStatus /
 * touchSessionActivity for why they're split (polling must NOT itself
 * count as activity, or leaving a tab open would defeat the timeout). */

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, peekSessionIdleStatus, touchSessionActivity } from "@/lib/auth/session";

export interface SessionIdleStatus {
  msRemaining: number;
}

/** Polled every ~20s by the warning banner. Returns null if there's no
 * session cookie, or the session has already hard-expired / idle-expired
 * — either way the banner's response is the same: send the person to
 * login. */
export async function checkSessionIdleStatus(): Promise<SessionIdleStatus | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return peekSessionIdleStatus(token);
}

/** "Stay signed in" button on the warning banner. */
export async function extendSession(): Promise<SessionIdleStatus | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return touchSessionActivity(token);
}
