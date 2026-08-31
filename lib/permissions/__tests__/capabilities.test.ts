import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, ACCOUNT_TYPES, isValidCapabilityKey, getCapabilityDef, CAPABILITY_CATEGORIES } from "../capabilities";

test("capabilities: every key is unique", () => {
  const keys = CAPABILITIES.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("capabilities: every capability defines a default for every account type", () => {
  for (const def of CAPABILITIES) {
    for (const type of ACCOUNT_TYPES) {
      assert.equal(typeof def.defaults[type], "boolean", `${def.key} missing a default for ${type}`);
    }
  }
});

test("capabilities: every capability belongs to a known category", () => {
  for (const def of CAPABILITIES) {
    assert.ok(CAPABILITY_CATEGORIES.includes(def.category), `${def.key} has unknown category ${def.category}`);
  }
});

test("capabilities: isValidCapabilityKey / getCapabilityDef agree with the registry", () => {
  assert.ok(isValidCapabilityKey("VIEW_ANALYTICS"));
  assert.ok(!isValidCapabilityKey("NOT_A_REAL_KEY"));
  assert.equal(getCapabilityDef("VIEW_ANALYTICS")?.key, "VIEW_ANALYTICS");
  assert.equal(getCapabilityDef("NOT_A_REAL_KEY"), undefined);
});

test("capabilities: MANAGE_PERMISSIONS defaults true for Admin only", () => {
  const def = getCapabilityDef("MANAGE_PERMISSIONS")!;
  for (const type of ACCOUNT_TYPES) {
    assert.equal(def.defaults[type], type === "ADMIN", `MANAGE_PERMISSIONS default for ${type}`);
  }
});

// 2026-08-21: the three Ledger Card items (IMPORT/CATEGORIZE/RECONCILE)
// are a confirmed exception to the subset's usual "Admin only" default —
// Oliver: "card would hold by partner tier or above and they're only
// people who can do card reconciliation for now" — see the doc comment
// above those three CAPABILITIES entries. Excluded here and covered by
// their own test below instead of weakening this invariant for everyone.
// SUPPLIER_CHECK_APPROVE / _INSTANT joined the Admin+Partner set on
// 2026-08-31 (approved lifecycle spec): the approver role is Aey's —
// Partner tier — by design, and instant checks are a Partner-and-up
// trust call, both further grantable per account when she hands off.
const FA_ADMIN_PARTNER_EXCEPTIONS = new Set([
  "FA_LEDGER_CARD_IMPORT", "FA_LEDGER_CARD_CATEGORIZE", "FA_LEDGER_CARD_RECONCILE",
  "SUPPLIER_CHECK_APPROVE", "SUPPLIER_CHECK_INSTANT",
]);

test("capabilities: Financial Auditor subset items are all expirable and false-by-default except Admin (Ledger Card items excepted)", () => {
  const faItems = CAPABILITIES.filter((c) => c.category === "FINANCIAL_AUDITOR" && !FA_ADMIN_PARTNER_EXCEPTIONS.has(c.key));
  assert.ok(faItems.length > 0);
  for (const def of faItems) {
    assert.equal(def.expirable, true, `${def.key} should be expirable`);
    for (const type of ACCOUNT_TYPES) {
      assert.equal(def.defaults[type], type === "ADMIN", `${def.key} default for ${type}`);
    }
  }
});

test("capabilities: Ledger Card FA_* items are expirable and default Admin+Partner only, matching the confirmed card-holder tightening", () => {
  for (const key of FA_ADMIN_PARTNER_EXCEPTIONS) {
    const def = getCapabilityDef(key)!;
    assert.equal(def.expirable, true, `${key} should be expirable`);
    assert.equal(def.defaults.ADMIN, true);
    assert.equal(def.defaults.PARTNER, true);
    assert.equal(def.defaults.FLOOR_MANAGER, false);
    assert.equal(def.defaults.ASSISTANT_MANAGER, false);
    assert.equal(def.defaults.STAFF, false);
  }
});

test("capabilities: Tip Pool structure edit defaults Admin+Partner only, matching the confirmed tightening", () => {
  const def = getCapabilityDef("TIP_POOL_STRUCTURE_EDIT")!;
  assert.equal(def.defaults.ADMIN, true);
  assert.equal(def.defaults.PARTNER, true);
  assert.equal(def.defaults.FLOOR_MANAGER, false);
  assert.equal(def.defaults.ASSISTANT_MANAGER, false);
  assert.equal(def.defaults.STAFF, false);
});

test("capabilities: Schedule management defaults OFF below Admin — granted per person (2026-08-24)", () => {
  const def = getCapabilityDef("SCHEDULE_MANAGE")!;
  assert.equal(def.defaults.ADMIN, true);
  assert.equal(def.defaults.PARTNER, false);
  assert.equal(def.defaults.FLOOR_MANAGER, false);
  assert.equal(def.defaults.ASSISTANT_MANAGER, false);
  assert.equal(def.defaults.STAFF, false);
});
