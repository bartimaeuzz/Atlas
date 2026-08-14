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
