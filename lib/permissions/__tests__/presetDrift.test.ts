import { test } from "node:test";
import assert from "node:assert/strict";
import { computePresetDrift, driftIsEmpty, summarizeDrift } from "../presetDrift";
import type { CapabilityGrantRow } from "../grantAllows";

/** A STAFF preset grants almost nothing, so anything held reads as
 * `extra`; a FLOOR_MANAGER preset grants a lot, so holding nothing reads
 * as `missing`. Those two directions are the whole point of the module. */
function rows(granted: Record<string, boolean | { granted: boolean; expiresAt: string | null }>) {
  const out: Record<string, CapabilityGrantRow> = {};
  for (const [k, v] of Object.entries(granted)) {
    out[k] = typeof v === "boolean" ? { granted: v, expiresAt: null } : v;
  }
  return out;
}

test("a capability held beyond the preset is EXTRA, not missing", () => {
  // PETTY_CASH_EDIT is not in the STAFF preset. Holding it is drift up.
  const drift = computePresetDrift(rows({ PETTY_CASH_EDIT: true }), "STAFF");
  assert.equal(drift.missing.length, 0);
  assert.ok(drift.extra.some((l) => /Petty Cash/.test(l)), `expected Petty Cash in extra, got ${JSON.stringify(drift)}`);
  assert.ok(summarizeDrift(drift).startsWith("+"));
});

test("a capability the preset grants but the account lacks is MISSING", () => {
  // Empty rows against a manager-tier preset: everything it grants is missing.
  const drift = computePresetDrift(rows({}), "FLOOR_MANAGER");
  assert.equal(drift.extra.length, 0);
  assert.ok(drift.missing.length > 0);
  assert.ok(summarizeDrift(drift).startsWith("−"));
});

test("an expired grant counts as missing — the person does not hold it today", () => {
  const drift = computePresetDrift(
    rows({ PETTY_CASH_EDIT: { granted: true, expiresAt: "2026-01-01" } }),
    "FLOOR_MANAGER",
    "2026-08-23"
  );
  assert.ok(drift.missing.some((l) => /Petty Cash/.test(l)));
  assert.ok(!drift.extra.some((l) => /Petty Cash/.test(l)));
});

test("an account sitting exactly on its preset has no drift", () => {
  const staffOnStaffPreset = computePresetDrift(rows({}), "STAFF");
  assert.ok(driftIsEmpty(staffOnStaffPreset), JSON.stringify(staffOnStaffPreset));
  assert.equal(summarizeDrift(staffOnStaffPreset), "");
});

test("summarizeDrift caps the list rather than spilling the whole set", () => {
  const drift = { extra: ["A", "B", "C", "D", "E"], missing: [] };
  assert.equal(summarizeDrift(drift, 3), "+A, +B, +C +2 more");
});
