/**
 * Manager route guard (2026-08-13) — first cut of gating the manager
 * pages (/shifts, /employees, /positions, /settings, /reports, /schedule)
 * behind the SAME staff PIN session already used for /me. Reuses
 * getCurrentStaffSession() as-is; no new auth mechanism, no schema
 * change. Deliberately minimal: checks the standing employees.systemRole
 * (MANAGER/ADMIN) only. Does NOT yet consider positions.grantsManagerAccess
 * (shift-scoped elevation for staff covering a manager shift) — someone
 * covering a manager shift without a standing MANAGER/ADMIN role will be
 * bounced by this first cut. Flagged as a known v1 gap, not an oversight;
 * extend here if/when that case actually comes up.
 */

import { redirect } from "next/navigation";
import { getCurrentStaffSession, type StaffSessionEmployee } from "./session";

export async function requireManager(): Promise<StaffSessionEmployee> {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    redirect("/login");
  }
  return session;
}

/** Page-level guard for Admin-only surfaces (2026-08-19, Permission
 * System Phase 1) — the "Permission and Roles" page specifically, since
 * the confirmed design has it as "Admin ✓ only, not delegable." A
 * logged-in non-Admin (Staff/Manager) is sent to /people rather than
 * /login — they DO have a valid session, just not this page's access
 * level, so bouncing them to the login screen would be confusing/wrong;
 * an anonymous visitor still lands on /login via the same check
 * requireManager uses (no session at all fails both branches below the
 * same way). */
export async function requireAdmin(): Promise<StaffSessionEmployee> {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");
  if (session.systemRole !== "ADMIN") redirect("/people");
  return session;
}
