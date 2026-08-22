import { test } from "node:test";
import assert from "node:assert/strict";
import { computePresetDiff, presetDiffIsEmpty } from "../presetDiff";
import { CAPABILITIES, getCapabilityDef } from "../capabilities";
import type { CapabilityGrantRow } from "../grantAllows";

/**
 * The preset preview on /permissions is the guard against the 2026-08-21
 * incident, where one click silently rewrote all 20 capability rows. A
 * preview that misstates the change is worse than none — it teaches the
 * Admin to click through. These pin it against the registry.
 */

const TODAY = "2026-08-22";

/** Every capability not granted, no expiry — a fresh account. */
function emptyCapabilities(): Record<string, CapabilityGrantRow> {
  const out: Record<string, CapabilityGrantRow> = {};
  for (const def of CAPABILITIES) out[def.key] = { granted: false, expiresAt: null };
  return out;
}

function labelOf(key: string): string {
  const def = getCapabilityDef(key);
  if (!def) throw new Error(`unknown key ${key}`);
  return def.label;
}

test("presetDiff: a fresh account getting ADMIN turns on every grantable capability", () => {
  const diff = computePresetDiff(emptyCapabilities(), "ADMIN", TODAY);
  const grantableAdminDefaults = CAPABILITIES.filter((d) => d.key !== "MANAGE_PERMISSIONS" && d.defaults.ADMIN);
  assert.equal(diff.turningOn.length, grantableAdminDefaults.length);
  assert.equal(diff.turningOff.length, 0);
  assert.equal(diff.restoringExpired.length, 0);
});

test("presetDiff: MANAGE_PERMISSIONS is never reported, because the action never writes it", () => {
  // Mirrors applyAccountTypePreset's `continue`. Reporting it would
  // promise a change that cannot happen.
  const caps = emptyCapabilities();
  const diff = computePresetDiff(caps, "ADMIN", TODAY);
  const manageLabel = labelOf("MANAGE_PERMISSIONS");
  assert.equal(diff.turningOn.includes(manageLabel), false);
  assert.equal(diff.turningOff.includes(manageLabel), false);
});

test("presetDiff: STAFF preset on a fully-granted account turns everything off", () => {
  const caps = emptyCapabilities();
  for (const def of CAPABILITIES) caps[def.key] = { granted: true, expiresAt: null };
  const diff = computePresetDiff(caps, "STAFF", TODAY);
  assert.equal(diff.turningOn.length, 0);
  assert.ok(diff.turningOff.length > 0, "STAFF preset should revoke a fully-granted account");
  assert.equal(diff.turningOff.includes(labelOf("MANAGE_PERMISSIONS")), false);
});

test("presetDiff: this is the 2026-08-21 incident — STAFF over a real manager's set is a mass revoke", () => {
  const caps = emptyCapabilities();
  for (const key of ["PETTY_CASH_EDIT", "SCHEDULE_MANAGE", "SUPPLIER_CHECK_LOG", "VIEW_LEDGER_OVERVIEW", "PEOPLE_CONTACT_INFO_VIEW"]) {
    caps[key] = { granted: true, expiresAt: null };
  }
  const diff = computePresetDiff(caps, "STAFF", TODAY);
  assert.equal(diff.turningOn.length, 0);
  assert.equal(diff.turningOff.length, 5, "all five held capabilities should be shown as being turned OFF");
  assert.equal(presetDiffIsEmpty(diff), false);
});

test("presetDiff: an EXPIRED grant the preset also grants is reported as restoring access, not as a no-op", () => {
  // The row reads granted=true, so a raw-column diff would see no change
  // at all. But the date has passed, so the person does NOT hold it today
  // and nulling the expiry hands it back. On the FA subset that is a real
  // access grant.
  const caps = emptyCapabilities();
  caps["FA_PAYROLL_LOCK_FINALIZE"] = { granted: true, expiresAt: "2026-01-01" };
  const diff = computePresetDiff(caps, "ADMIN", TODAY);
  assert.equal(diff.restoringExpired.includes(labelOf("FA_PAYROLL_LOCK_FINALIZE")), true);
  assert.equal(diff.turningOn.includes(labelOf("FA_PAYROLL_LOCK_FINALIZE")), false);
});

test("presetDiff: an EXPIRED grant the preset does NOT grant is not reported as a removal", () => {
  // Nothing is being taken away — they already lost it when it expired.
  const caps = emptyCapabilities();
  caps["FA_PAYROLL_LOCK_FINALIZE"] = { granted: true, expiresAt: "2026-01-01" };
  const diff = computePresetDiff(caps, "STAFF", TODAY);
  assert.equal(diff.turningOff.includes(labelOf("FA_PAYROLL_LOCK_FINALIZE")), false);
});

test("presetDiff: a grant expiring TODAY still counts as held (expiry is exclusive)", () => {
  const caps = emptyCapabilities();
  caps["FA_PAYROLL_LOCK_FINALIZE"] = { granted: true, expiresAt: TODAY };
  const diff = computePresetDiff(caps, "STAFF", TODAY);
  assert.equal(diff.turningOff.includes(labelOf("FA_PAYROLL_LOCK_FINALIZE")), true);
});

test("presetDiff: applying the preset an account already matches reports nothing", () => {
  const caps = emptyCapabilities();
  for (const def of CAPABILITIES) {
    if (def.key === "MANAGE_PERMISSIONS") continue;
    caps[def.key] = { granted: def.defaults.PARTNER, expiresAt: null };
  }
  const diff = computePresetDiff(caps, "PARTNER", TODAY);
  assert.equal(presetDiffIsEmpty(diff), true);
});

test("presetDiff: a missing capability row is treated as not-granted", () => {
  // A fresh account has no employee_capabilities rows at all.
  const diff = computePresetDiff({}, "FLOOR_MANAGER", TODAY);
  const expected = CAPABILITIES.filter((d) => d.key !== "MANAGE_PERMISSIONS" && d.defaults.FLOOR_MANAGER);
  assert.equal(diff.turningOn.length, expected.length);
  assert.equal(diff.turningOff.length, 0);
});

test("presetDiff: every reported label is a real registry label", () => {
  const caps = emptyCapabilities();
  caps["VIEW_ANALYTICS"] = { granted: true, expiresAt: null };
  const diff = computePresetDiff(caps, "FLOOR_MANAGER", TODAY);
  const allLabels = new Set(CAPABILITIES.map((d) => d.label));
  for (const label of [...diff.turningOn, ...diff.turningOff, ...diff.restoringExpired]) {
    assert.equal(allLabels.has(label), true, `${label} is not a registry label`);
  }
});
