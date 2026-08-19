/**
 * Staff session helpers (2026-08-10) — a random token in an httpOnly
 * cookie, resolved against the staffSessions table on every request. See
 * db/schema.ts's staffSessions comment for why this is a plain server-side
 * session store instead of a JWT, and for the explicit scope note (only
 * the new staff pages are protected — the existing manager pages are
 * untouched by this).
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { staffSessions, employees } from "@/db/schema";
import { idleCutoff, shouldTouchActivity, msUntilIdleTimeout, IDLE_TIMEOUT_MS } from "./idleTimeout";

export const SESSION_COOKIE_NAME = "atlas_staff_session";
// A shift-length-ish window, not a "remember me forever" session — this is
// a shared terminal, so sessions shouldn't silently outlive the person's
// actual shift by much. This is the outer bound; the 30-minute inactivity
// timeout below (IDLE_TIMEOUT_MS, added 2026-08-19) is the tighter,
// resettable one that actually fires first in normal use — see
// idleTimeout.ts and project memory "Atlas Session Security".
const SESSION_DURATION_MS = 14 * 60 * 60 * 1000; // 14 hours

export interface StaffSessionEmployee {
  id: number;
  name: string;
  systemRole: "STAFF" | "MANAGER" | "ADMIN";
  primaryPositionId: number | null;
  /** 2026-08-15 -- see employees.isFinancialAuditor's schema comment.
   * Lets a page decide whether to even show "Edit" on an already
   * Printed/Paid supplier check invoice without a separate query. */
  isFinancialAuditor: boolean;
}

export async function createSession(employeeId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await db.insert(staffSessions).values({ token, employeeId, expiresAt, lastActivityAt: nowIso });
  return token;
}

export async function destroySessionByToken(token: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.token, token));
}

/** Resolves a raw token to the employee it belongs to, or null if the
 * token doesn't exist, has hit the 14h hard expiry, or has sat idle past
 * IDLE_TIMEOUT_MS (30 min — see idleTimeout.ts). Doesn't touch cookies —
 * callers that need the current request's session should use
 * getCurrentStaffSession below instead; this is split out so it stays
 * easily unit-testable against a token string directly.
 *
 * Every call here IS a real authenticated request (a page load or a
 * server action), so this is also where activity gets recorded: once a
 * row resolves, its lastActivityAt is bumped to now — throttled (see
 * shouldTouchActivity) so normal browsing doesn't turn into a write on
 * every single request. This is the actual enforcement point for the
 * idle timeout; the client-side warning banner (app/SessionIdleWarning.tsx)
 * is a UX layer on top, not a substitute for it. */
export async function resolveSessionToken(token: string): Promise<StaffSessionEmployee | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const idleCutoffIso = idleCutoff(now).toISOString();
  const [row] = await db
    .select({
      id: employees.id,
      name: employees.nickname,
      systemRole: employees.systemRole,
      primaryPositionId: employees.primaryPositionId,
      isFinancialAuditor: employees.isFinancialAuditor,
      lastActivityAt: staffSessions.lastActivityAt,
    })
    .from(staffSessions)
    .innerJoin(employees, eq(staffSessions.employeeId, employees.id))
    .where(
      and(
        eq(staffSessions.token, token),
        gt(staffSessions.expiresAt, nowIso),
        gt(staffSessions.lastActivityAt, idleCutoffIso),
      ),
    );
  if (!row) return null;

  if (shouldTouchActivity(new Date(row.lastActivityAt), now)) {
    await db.update(staffSessions).set({ lastActivityAt: nowIso }).where(eq(staffSessions.token, token));
  }

  return {
    id: row.id,
    name: row.name,
    systemRole: row.systemRole,
    primaryPositionId: row.primaryPositionId,
    isFinancialAuditor: row.isFinancialAuditor,
  };
}

/** Read-only idle-status lookup for the warning banner's polling status
 * action (lib/actions/session.ts) — deliberately does NOT touch
 * lastActivityAt. Just having the tab open and polling shouldn't itself
 * count as activity and perpetually postpone the timeout; only a real
 * page load / server action (resolveSessionToken above) or an explicit
 * "Stay signed in" click (touchSessionActivity below) should. Returns
 * null if the token doesn't resolve to a still-valid, non-idle-expired
 * session right now — the banner treats that as "already signed out." */
export async function peekSessionIdleStatus(token: string): Promise<{ msRemaining: number } | null> {
  const now = new Date();
  const [row] = await db
    .select({ lastActivityAt: staffSessions.lastActivityAt, expiresAt: staffSessions.expiresAt })
    .from(staffSessions)
    .where(eq(staffSessions.token, token));
  if (!row) return null;
  if (new Date(row.expiresAt) <= now) return null;
  const msRemaining = msUntilIdleTimeout(new Date(row.lastActivityAt), now);
  return msRemaining > 0 ? { msRemaining } : null;
}

/** Explicit, unthrottled activity touch for the warning banner's "Stay
 * signed in" button — the one place a mere UI interaction (not a real
 * page navigation or data-changing action) is allowed to reset the idle
 * clock, since the user just told us directly they're at the terminal.
 * Returns null (rather than resetting anything) if the session is
 * already gone/hard-expired, so the banner knows to send them to login
 * instead of showing a falsely-refreshed countdown. */
export async function touchSessionActivity(token: string): Promise<{ msRemaining: number } | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const [row] = await db.select({ expiresAt: staffSessions.expiresAt }).from(staffSessions).where(eq(staffSessions.token, token));
  if (!row || new Date(row.expiresAt) <= now) return null;
  await db.update(staffSessions).set({ lastActivityAt: nowIso }).where(eq(staffSessions.token, token));
  return { msRemaining: IDLE_TIMEOUT_MS };
}

/** Reads the session cookie for the CURRENT request and resolves it — the
 * one server components/pages should actually call. Returns null if
 * there's no cookie, or if the token doesn't resolve (expired/invalid). */
export async function getCurrentStaffSession(): Promise<StaffSessionEmployee | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveSessionToken(token);
}
