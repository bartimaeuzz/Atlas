/**
 * Permission System — Phase B capability backfill (2026-08-21). See
 * project_atlas_permission_system memory for the confirmed design and
 * lib/permissions/capabilities.ts for the registry/preset defaults this
 * reads. Run via `npx tsx db/backfillCapabilities.ts` — same
 * zip-delivered, run-it-yourself pattern as db/migrate.ts, per standing
 * Atlas policy that Claude never writes ad-hoc data directly against
 * Turso (see project_atlas_github_access_policy memory).
 *
 * WHAT THIS DOES: a fresh/never-configured employee account has ZERO
 * employeeCapabilities rows -- "no row" means "not granted" everywhere
 * this app reads the table (see loadCapabilityMatrix.ts, requireCapability.ts).
 * A live read-only check on 2026-08-21 found 21 of 24 employees in this
 * state, including Oliver's own real ADMIN account. This script gives
 * every such employee a sane STARTING capability set, mapped from their
 * EXISTING systemRole + isPartner flag onto the confirmed Account Type
 * presets:
 *   - systemRole ADMIN               -> ADMIN preset
 *   - systemRole MANAGER, isPartner  -> PARTNER preset
 *   - systemRole MANAGER, !isPartner -> FLOOR_MANAGER preset
 *   - systemRole STAFF               -> STAFF preset
 * (ASSISTANT_MANAGER has no equivalent in today's systemRole/isPartner
 * fields -- that distinction only exists once someone is deliberately
 * set up that way via the /permissions page, so it's never a backfill
 * target. Same reasoning for anyone who should be treated as an
 * exception to their role's default -- this script only ever sets the
 * generic starting point, exactly like applyAccountTypePreset does when
 * an Admin clicks "Apply preset" by hand.)
 *
 * SAFETY: only touches employees with ZERO existing employeeCapabilities
 * rows. Anyone Oliver has already touched via the /permissions page
 * (confirmed 2026-08-21: Aey and the seed "Chui"/"ADMIN" test accounts)
 * is left completely alone, so this can never clobber a manual grant or
 * revocation. Idempotent for that reason too -- running it twice is a
 * no-op the second time (everyone it would touch now has rows).
 *
 * Every row written also gets a permission_grant_log entry, same as a
 * manual preset-apply, so the audit trail (Oliver: "log the permission
 * grants too") shows these as real events, not silent inserts. Since
 * there's no human Admin clicking "Apply preset" during an offline
 * backfill, actingEmployeeId is set to the employee's OWN id and the
 * note makes clear this was a system backfill, not a self-grant.
 */

import { db } from "./client";
import { employees, employeeCapabilities, permissionGrantLog } from "./schema";
import { CAPABILITIES, type AccountType } from "../lib/permissions/capabilities";
import { sql } from "drizzle-orm";

function accountTypeFor(systemRole: "STAFF" | "MANAGER" | "ADMIN", isPartner: boolean): AccountType {
  if (systemRole === "ADMIN") return "ADMIN";
  if (systemRole === "MANAGER") return isPartner ? "PARTNER" : "FLOOR_MANAGER";
  return "STAFF";
}

async function backfill() {
  const allEmployees = await db
    .select({ id: employees.id, nickname: employees.nickname, systemRole: employees.systemRole, isPartner: employees.isPartner })
    .from(employees);

  const capCountRows = await db
    .select({ employeeId: employeeCapabilities.employeeId, n: sql<number>`count(*)` })
    .from(employeeCapabilities)
    .groupBy(employeeCapabilities.employeeId);
  const hasRows = new Set(capCountRows.filter((r) => r.n > 0).map((r) => r.employeeId));

  const targets = allEmployees.filter((e) => !hasRows.has(e.id));

  if (targets.length === 0) {
    console.log("Nothing to backfill -- every employee already has at least one employee_capabilities row.");
    return;
  }

  console.log(`Backfilling ${targets.length} of ${allEmployees.length} employees (skipping ${allEmployees.length - targets.length} who already have rows)...`);

  const nowIso = new Date().toISOString();

  for (const emp of targets) {
    const accountType = accountTypeFor(emp.systemRole, emp.isPartner);
    let written = 0;
    for (const def of CAPABILITIES) {
      if (def.key === "MANAGE_PERMISSIONS") continue; // never a real row -- see permissions.ts header
      const granted = def.defaults[accountType];
      await db.insert(employeeCapabilities).values({
        employeeId: emp.id,
        capabilityKey: def.key,
        granted,
        expiresAt: null,
        updatedAt: nowIso,
      });
      if (granted) {
        await db.insert(permissionGrantLog).values({
          employeeId: emp.id,
          capabilityKey: def.key,
          action: "GRANTED",
          expiresAt: null,
          actingEmployeeId: emp.id,
          note: `System backfill (2026-08-21): applied ${accountType} preset based on existing systemRole/isPartner -- not a self-grant.`,
        });
        written++;
      }
    }
    console.log(`  ${emp.nickname} (id ${emp.id}, ${emp.systemRole}${emp.isPartner ? "+partner" : ""}) -> ${accountType} preset, ${written} capabilities granted`);
  }

  console.log("Backfill complete.");
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
