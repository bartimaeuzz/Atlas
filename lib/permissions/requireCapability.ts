/**
 * Permission System — Phase B capability enforcement (2026-08-21). See
 * project_atlas_permission_system memory for the full confirmed design
 * and lib/permissions/capabilities.ts for the registry these checks read
 * against. Phase A (2026-08-21, commit 0850605) closed the "zero auth
 * check at all" gap across lib/actions/*.ts using a coarse per-file
 * requireManagerAction() (systemRole MANAGER/ADMIN only) helper. Phase B
 * is the fine-grained follow-up this file exists for: check ONE specific
 * capability key instead of the coarse role gate, so Admin can grant or
 * revoke a single account's access to a single action family without
 * touching everyone else's.
 *
 * Unlike requireManagerAction() (copy-pasted per file, matching this
 * codebase's existing convention), this helper is written once and
 * imported everywhere — the capability-row lookup logic is genuinely
 * shared, not action-specific, so there's nothing to customize per file.
 *
 * DEPLOYMENT DEPENDENCY, confirmed via a live read-only query 2026-08-21:
 * a fresh/never-configured employee account has ZERO employeeCapabilities
 * rows, and "no row" means "not granted" — see loadCapabilityMatrix.ts's
 * own doc comment, same convention here. At the time this shipped,
 * Oliver's own real ADMIN account (id 16) had zero capability rows in
 * production (only the seed "ADMIN" test account had been fully granted
 * via his own /permissions testing) — wiring a strict row-only check
 * would have locked him out of his own admin surface the moment this
 * deployed. See db/backfillCapabilities.ts for the fix going forward
 * (assigns baseline preset rows to every employee who has none yet), but
 * as defense-in-depth THIS helper also always passes for systemRole
 * ADMIN regardless of capability rows — same "not delegable, always a
 * way in" reasoning lib/actions/permissions.ts's requireAdminAction()
 * already uses for MANAGE_PERMISSIONS (see that file's header comment).
 * This can only ever grant an Admin MORE access, never less — Admin
 * already has unrestricted access via every other requireManagerAction()
 * gate in the app today, and every capability's confirmed default is
 * ADMIN: true anyway (see capabilities.ts) — so this bypass doesn't
 * change what Admin can reach, it only removes a data-dependency
 * lockout risk for the one account type that must never be able to lock
 * itself out.
 *
 * Verified 2026-08-21 (see the Phase B build report): the specific
 * capabilities wired in this round (PETTY_CASH_EDIT, SUPPLIER_CHECK_LOG,
 * SCHEDULE_MANAGE, TIP_POOL_STRUCTURE_EDIT, EDIT_SETTINGS) are already
 * granted on Aey's real account from Oliver's own prior /permissions
 * testing (her granted set exactly matches the PARTNER preset), so this
 * rollout doesn't depend on the backfill script having run yet — it's
 * still recommended so future promotions/new hires don't land on a
 * silently-empty capability set.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeCapabilities } from "@/db/schema";
import { getCurrentStaffSession, type StaffSessionEmployee } from "@/lib/auth/session";
import { isValidCapabilityKey } from "@/lib/permissions/capabilities";
import { grantAllows } from "@/lib/permissions/viewerCapabilities";

/** Throws "Not authorized." (same contract as requireManagerAction(),
 * so existing try/catch call sites don't need to change) unless the
 * current session holds `capabilityKey` — granted=true and (if set) not
 * yet expired — or is systemRole ADMIN (see file header for why). Returns
 * the session on success, matching requireManagerAction()'s return shape
 * so callers that read session.id/session.name after the check need no
 * other changes. */
export async function requireCapability(capabilityKey: string): Promise<StaffSessionEmployee> {
  if (!isValidCapabilityKey(capabilityKey)) {
    // A programmer error (typo'd key), not a runtime auth failure --
    // fail loudly rather than silently denying/allowing the wrong thing.
    throw new Error(`Unknown capability key: ${capabilityKey}`);
  }

  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not authorized.");
  if (session.systemRole === "ADMIN") return session; // see file header

  // The grant decision itself lives in viewerCapabilities.ts so the
  // action guard (here) and the page view guards can never drift apart
  // on what "holds this capability" means -- added 2026-08-21 with
  // Phase C. Behaviour here is unchanged: same granted/expiry rules,
  // same "no row means not granted" convention.
  const [row] = await db
    .select({ granted: employeeCapabilities.granted, expiresAt: employeeCapabilities.expiresAt })
    .from(employeeCapabilities)
    .where(and(eq(employeeCapabilities.employeeId, session.id), eq(employeeCapabilities.capabilityKey, capabilityKey)));

  if (!grantAllows(false, row)) throw new Error("Not authorized.");

  return session;
}
