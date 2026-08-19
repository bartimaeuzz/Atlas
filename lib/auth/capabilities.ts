/**
 * Permission System — capability lookup/guard helpers (2026-08-19, Phase 1
 * "Foundation"). Reads the employee_capabilities table added in
 * db/schema.ts; see lib/permissions/capabilities.ts for the registry of
 * valid keys this reads against.
 *
 * NOT YET WIRED INTO ANY EXISTING SERVER ACTION — that audit (going
 * through lib/actions/*.ts and swapping systemRole-only checks for the
 * right capability check, starting with publishWeek's total lack of an
 * auth check) is an explicitly separate, later phase. requireCapability
 * below exists now so that phase can start consuming it immediately
 * without also having to invent the plumbing at the same time.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeCapabilities } from "@/db/schema";
import { getCurrentStaffSession } from "./session";
import { isValidCapabilityKey } from "@/lib/permissions/capabilities";

/** A capability row counts as granted only if `granted` is true AND
 * (no expiry OR the expiry hasn't passed yet). Expired-but-still-marked-
 * granted rows are treated as not-granted here, but are NOT auto-flipped
 * back to false in the DB by this read path — a later phase may want an
 * explicit sweep/cron for that instead of a read having side effects. */
export function isRowCurrentlyGranted(row: { granted: boolean; expiresAt: string | null }): boolean {
  if (!row.granted) return false;
  if (!row.expiresAt) return true;
  return new Date(row.expiresAt).getTime() > Date.now();
}

/** Returns the set of capability keys currently granted (and not expired)
 * for one employee. Unknown/invalid keys stored in the DB (shouldn't
 * happen, but schema doesn't enforce the enum at the column level) are
 * silently excluded rather than thrown on, so a future registry rename
 * doesn't crash every capability check. */
export async function getGrantedCapabilityKeys(employeeId: number): Promise<Set<string>> {
  const rows = await db
    .select({ capabilityKey: employeeCapabilities.capabilityKey, granted: employeeCapabilities.granted, expiresAt: employeeCapabilities.expiresAt })
    .from(employeeCapabilities)
    .where(eq(employeeCapabilities.employeeId, employeeId));
  const granted = new Set<string>();
  for (const row of rows) {
    if (!isValidCapabilityKey(row.capabilityKey)) continue;
    if (isRowCurrentlyGranted(row)) granted.add(row.capabilityKey);
  }
  return granted;
}

export async function hasCapability(employeeId: number, capabilityKey: string): Promise<boolean> {
  const [row] = await db
    .select({ granted: employeeCapabilities.granted, expiresAt: employeeCapabilities.expiresAt })
    .from(employeeCapabilities)
    .where(and(eq(employeeCapabilities.employeeId, employeeId), eq(employeeCapabilities.capabilityKey, capabilityKey)));
  if (!row) return false;
  return isRowCurrentlyGranted(row);
}

/** For use inside a Server Action once a later phase starts enforcing
 * capabilities there (same "throw, don't redirect" convention as the
 * per-file requireManagerAction()/isAdminSession() helpers already used
 * across lib/actions/*.ts). Throws if there's no session or the session's
 * employee doesn't currently hold the capability. */
export async function requireCapability(capabilityKey: string): Promise<void> {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not authorized.");
  const granted = await hasCapability(session.id, capabilityKey);
  if (!granted) throw new Error("Not authorized.");
}
