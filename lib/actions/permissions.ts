"use server";

/** Permission System — "Permission and Roles" page actions (2026-08-19,
 * Phase 1 "Foundation"). See project_atlas_permission_system memory for
 * the full confirmed design and lib/permissions/capabilities.ts for the
 * capability registry these actions read/write against.
 *
 * Admin-only, matching the confirmed design ("Manage Permissions — Admin
 * ✓ only, not delegable"). Page access itself is gated on
 * employees.systemRole === "ADMIN" directly (same as every other
 * Admin-only surface in this app — RecoveryCodeSection, the personal-info
 * fields in employees.ts) rather than on the MANAGE_PERMISSIONS
 * capability row, specifically because "not delegable" means there must
 * always be a way in that doesn't depend on a capability grant existing
 * — using the capability row itself to gate the page that manages
 * capability rows would create exactly the dead-end/lockout risk the
 * rest of this app is careful to avoid (see hasOtherActiveManagerOrAdmin
 * in employees.ts for the analogous existing precedent).
 */

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeeCapabilities, permissionGrantLog } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { CAPABILITIES, ACCOUNT_TYPES, type AccountType } from "@/lib/permissions/capabilities";

export interface PermissionActionState {
  error: string | null;
  saved: boolean;
}

async function requireAdminAction() {
  const session = await getCurrentStaffSession();
  if (!session || session.systemRole !== "ADMIN") {
    throw new Error("Not authorized.");
  }
  return session;
}

async function upsertCapabilityRow(employeeId: number, capabilityKey: string, granted: boolean, expiresAt: string | null) {
  const nowIso = new Date().toISOString();
  const [existing] = await db
    .select({ id: employeeCapabilities.id })
    .from(employeeCapabilities)
    .where(and(eq(employeeCapabilities.employeeId, employeeId), eq(employeeCapabilities.capabilityKey, capabilityKey)));
  if (existing) {
    await db
      .update(employeeCapabilities)
      .set({ granted, expiresAt, updatedAt: nowIso })
      .where(eq(employeeCapabilities.id, existing.id));
  } else {
    await db.insert(employeeCapabilities).values({ employeeId, capabilityKey, granted, expiresAt, updatedAt: nowIso });
  }
}

/** Saves every capability toggle + expiry input for ONE employee in a
 * single submit — one form per employee section on the Permission and
 * Roles page, rather than an instant-submit form per checkbox (would be
 * ~18 separate forms per employee, awkward for an Admin adjusting
 * several things before committing). Reads `cap_<KEY>` ("on"/absent) and
 * `exp_<KEY>` (date string, only meaningful when the capability is
 * granted and expirable) for every registry key, diffs against current
 * DB state, and only writes/logs the keys that actually changed.
 * MANAGE_PERMISSIONS is always skipped — see file header for why it's
 * not a togglable capability. */
export async function saveEmployeeCapabilities(
  _prevState: PermissionActionState,
  formData: FormData
): Promise<PermissionActionState> {
  try {
    const actingSession = await requireAdminAction();

    const employeeId = Number(formData.get("employeeId"));
    if (!Number.isFinite(employeeId) || employeeId <= 0) throw new Error("Invalid employee.");

    const existingRows = await db
      .select({ capabilityKey: employeeCapabilities.capabilityKey, granted: employeeCapabilities.granted, expiresAt: employeeCapabilities.expiresAt })
      .from(employeeCapabilities)
      .where(eq(employeeCapabilities.employeeId, employeeId));
    const current = new Map(existingRows.map((r) => [r.capabilityKey, { granted: r.granted, expiresAt: r.expiresAt }]));

    for (const def of CAPABILITIES) {
      if (def.key === "MANAGE_PERMISSIONS") continue;

      const nextGranted = formData.get(`cap_${def.key}`) === "on";
      const expiresAtRaw = String(formData.get(`exp_${def.key}`) ?? "").trim();
      const nextExpiresAt = nextGranted && def.expirable && expiresAtRaw ? expiresAtRaw : null;

      const prev = current.get(def.key) ?? { granted: false, expiresAt: null };
      if (prev.granted === nextGranted && prev.expiresAt === nextExpiresAt) continue;

      await upsertCapabilityRow(employeeId, def.key, nextGranted, nextExpiresAt);
      await db.insert(permissionGrantLog).values({
        employeeId,
        capabilityKey: def.key,
        action: nextGranted ? "GRANTED" : "REVOKED",
        expiresAt: nextExpiresAt,
        actingEmployeeId: actingSession.id,
        note: null,
      });
    }

    revalidatePath("/permissions");
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong.", saved: false };
  }
}

/** Applies an Account Type preset bundle to one employee — the
 * "reset to preset" path the confirmed design describes for the
 * /people create/edit form's Account Type selector (surfaced here on
 * the Permission and Roles page for Phase 1; wiring it into the People
 * form directly is a fast-follow, not yet done). Overwrites every
 * registry capability for this employee to the preset's default,
 * INCLUDING clearing any per-item expiry that was previously set — this
 * is a deliberate "start clean from this preset" action, not a merge.
 * MANAGE_PERMISSIONS is skipped (see file header). Every capability that
 * actually changes state gets its own permission_grant_log row so the
 * log stays a meaningful account of what changed, not one opaque blob
 * per preset-apply click. */
export async function applyAccountTypePreset(
  _prevState: PermissionActionState,
  formData: FormData
): Promise<PermissionActionState> {
  try {
    const actingSession = await requireAdminAction();

    const employeeId = Number(formData.get("employeeId"));
    const accountType = String(formData.get("accountType") ?? "");

    if (!Number.isFinite(employeeId) || employeeId <= 0) throw new Error("Invalid employee.");
    if (!ACCOUNT_TYPES.includes(accountType as AccountType)) throw new Error("Invalid account type.");

    const [employeeRow] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
    if (!employeeRow) throw new Error("Employee not found.");

    const existingRows = await db
      .select({
        capabilityKey: employeeCapabilities.capabilityKey,
        granted: employeeCapabilities.granted,
        expiresAt: employeeCapabilities.expiresAt,
      })
      .from(employeeCapabilities)
      .where(eq(employeeCapabilities.employeeId, employeeId));
    const currentState = new Map(existingRows.map((r) => [r.capabilityKey, { granted: r.granted, expiresAt: r.expiresAt }]));

    for (const def of CAPABILITIES) {
      if (def.key === "MANAGE_PERMISSIONS") continue;
      const nextGranted = def.defaults[accountType as AccountType];
      await upsertCapabilityRow(employeeId, def.key, nextGranted, null);
      const prev = currentState.get(def.key) ?? { granted: false, expiresAt: null };
      const prevGranted = prev.granted;
      // 2026-08-22 (scrutinize): this used to log only when `granted`
      // flipped, so clearing an expiry on an already-granted capability
      // was written to the DB and never recorded. That is not cosmetic --
      // grantAllows() treats an expired row as NOT granted, so wiping the
      // date on a lapsed Financial Auditor grant silently RESTORES live
      // access (payroll lock/finalize, card reconcile) with no audit
      // trail. Logged as a GRANTED event now, since that is what it is.
      const expiryCleared = prevGranted && nextGranted && prev.expiresAt !== null;
      if (prevGranted !== nextGranted || expiryCleared) {
        await db.insert(permissionGrantLog).values({
          employeeId,
          capabilityKey: def.key,
          action: nextGranted ? "GRANTED" : "REVOKED",
          expiresAt: null,
          actingEmployeeId: actingSession.id,
          note: expiryCleared && prevGranted === nextGranted
            ? `Applied ${accountType} preset — cleared expiry ${prev.expiresAt}`
            : `Applied ${accountType} preset`,
        });
      }
    }

    // Record WHICH preset this account was put on (2026-08-23). Written
    // after the capability rows, so a failure part-way through leaves the
    // account without a preset stamp rather than claiming a preset it
    // does not actually match -- the honest direction to fail in, since
    // /permissions reads this to say how far someone has drifted from
    // their preset. Individual capability edits afterwards deliberately
    // do NOT clear it; that drift is the thing worth seeing.
    await db.update(employees).set({ accountType: accountType as AccountType }).where(eq(employees.id, employeeId));

    revalidatePath("/permissions");
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong.", saved: false };
  }
}
