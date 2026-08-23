/**
 * Fill in capability rows for registry keys an employee has NO row for.
 *
 * WHY THIS EXISTS, and why the 2026-08-21 backfill was not enough.
 * `backfillCapabilities.ts` only touches employees with ZERO rows, so it
 * gives a never-configured account a starting set and is a no-op forever
 * after. That is correct for what it was written for, and it leaves a
 * structural gap: when a NEW capability is added to the registry, every
 * existing account has no row for it — and "no row" means "not granted"
 * everywhere this app reads the table.
 *
 * The result is a capability whose registry default says PARTNER: true
 * that no Partner can actually use. Found on 2026-08-22 adding
 * VIEW_ACTIVITY_LOG: Oliver's own ADMIN account would have seen the page
 * via the admin bypass, so the gap would have looked fine to the person
 * most likely to check, while Aey — the Partner the requirement was
 * written for — silently could not open it.
 *
 * WHAT THIS DOES. For every employee that already has capability rows, it
 * inserts a row for each registry key they have no row for at all, using
 * the same systemRole/isPartner → preset derivation the original backfill
 * uses. Run it after any deploy that adds a capability.
 *
 * WHAT IT DELIBERATELY WILL NOT DO. It never touches an existing row. A
 * deliberate revocation is stored as a row with granted = 0, not as an
 * absent row, so a hand-tuned account keeps every one of its decisions —
 * this can only ever fill genuine blanks. It is idempotent for the same
 * reason: run it twice and the second pass finds no blanks.
 *
 * Same run-it-yourself policy as db/migrate.ts and the original backfill:
 * `npx tsx db/syncNewCapabilities.ts`, from Oliver's own machine, never
 * written directly against Turso from a Claude session.
 */

import { db } from "./client";
import { employees, employeeCapabilities, permissionGrantLog } from "./schema";
import { CAPABILITIES, type AccountType } from "../lib/permissions/capabilities";

function accountTypeFor(systemRole: "STAFF" | "MANAGER" | "ADMIN", isPartner: boolean): AccountType {
  if (systemRole === "ADMIN") return "ADMIN";
  if (systemRole === "MANAGER") return isPartner ? "PARTNER" : "FLOOR_MANAGER";
  return "STAFF";
}

async function sync() {
  const allEmployees = await db
    .select({
      id: employees.id,
      nickname: employees.nickname,
      systemRole: employees.systemRole,
      isPartner: employees.isPartner,
    })
    .from(employees);

  const existing = await db
    .select({ employeeId: employeeCapabilities.employeeId, capabilityKey: employeeCapabilities.capabilityKey })
    .from(employeeCapabilities);

  const held = new Map<number, Set<string>>();
  for (const row of existing) {
    if (!held.has(row.employeeId)) held.set(row.employeeId, new Set());
    held.get(row.employeeId)!.add(row.capabilityKey);
  }

  const nowIso = new Date().toISOString();
  let totalRows = 0;
  let touchedEmployees = 0;

  for (const emp of allEmployees) {
    const theirs = held.get(emp.id);
    // No rows at all is the ORIGINAL backfill's job, not this one — leave
    // it alone so the two scripts can never disagree about a fresh account.
    if (!theirs || theirs.size === 0) {
      console.log(`  ${emp.nickname} (id ${emp.id}) has no rows at all — skipping; run backfillCapabilities.ts for that.`);
      continue;
    }

    const accountType = accountTypeFor(emp.systemRole, emp.isPartner);
    const missing = CAPABILITIES.filter(
      (def) => def.key !== "MANAGE_PERMISSIONS" && !theirs.has(def.key)
    );
    if (missing.length === 0) continue;

    touchedEmployees++;
    let granted = 0;
    for (const def of missing) {
      const isGranted = def.defaults[accountType];
      await db.insert(employeeCapabilities).values({
        employeeId: emp.id,
        capabilityKey: def.key,
        granted: isGranted,
        expiresAt: null,
        updatedAt: nowIso,
      });
      totalRows++;
      if (isGranted) {
        granted++;
        await db.insert(permissionGrantLog).values({
          employeeId: emp.id,
          capabilityKey: def.key,
          action: "GRANTED",
          expiresAt: null,
          actingEmployeeId: emp.id,
          note: `System sync: new capability ${def.key} filled in from the ${accountType} preset — not a self-grant.`,
        });
      }
    }
    console.log(
      `  ${emp.nickname} (id ${emp.id}, ${accountType}) -> ${missing.length} new key(s) added, ${granted} granted: ${missing.map((m) => m.key).join(", ")}`
    );
  }

  if (totalRows === 0) {
    console.log("Nothing to sync — every employee already has a row for every registry capability.");
  } else {
    console.log(`Sync complete: ${totalRows} row(s) across ${touchedEmployees} employee(s).`);
  }
}

sync()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
