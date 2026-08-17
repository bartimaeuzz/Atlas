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

export const SESSION_COOKIE_NAME = "atlas_staff_session";
// A shift-length-ish window, not a "remember me forever" session — this is
// a shared terminal, so sessions shouldn't silently outlive the person's
// actual shift by much. No refresh-on-activity yet; logging in again is
// cheap (just a PIN), so a hard expiry is fine for v1.
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
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await db.insert(staffSessions).values({ token, employeeId, expiresAt });
  return token;
}

export async function destroySessionByToken(token: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.token, token));
}

/** Resolves a raw token to the employee it belongs to, or null if the
 * token doesn't exist or has expired. Doesn't touch cookies — callers that
 * need the current request's session should use getCurrentStaffSession
 * below instead; this is split out so it stays easily unit-testable
 * against a token string directly. */
export async function resolveSessionToken(token: string): Promise<StaffSessionEmployee | null> {
  const nowIso = new Date().toISOString();
  const [row] = await db
    .select({
      id: employees.id,
      name: employees.nickname,
      systemRole: employees.systemRole,
      primaryPositionId: employees.primaryPositionId,
      isFinancialAuditor: employees.isFinancialAuditor,
    })
    .from(staffSessions)
    .innerJoin(employees, eq(staffSessions.employeeId, employees.id))
    .where(and(eq(staffSessions.token, token), gt(staffSessions.expiresAt, nowIso)));
  return row ?? null;
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
