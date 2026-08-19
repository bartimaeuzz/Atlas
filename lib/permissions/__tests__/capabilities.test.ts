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

test("capabilities: Financial Auditor subset items are all expirable and false-by-default except Admin", () => {
  const faItems = CAPABILITIES.filter((c) => c.category === "FINANCIAL_AUDITOR");
  assert.ok(faItems.length > 0);
  for (const def of faItems) {
    assert.equal(def.expirable, true, `${def.key} should be expirable`);
    for (const type of ACCOUNT_TYPES) {
      assert.equal(def.defaults[type], type === "ADMIN", `${def.key} default for ${type}`);
    }
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

test("capabilities: Schedule management defaults ON for every manager-tier account type", () => {
  const def = getCapabilityDef("SCHEDULE_MANAGE")!;
  assert.equal(def.defaults.ADMIN, true);
  assert.equal(def.defaults.PARTNER, true);
  assert.equal(def.defaults.FLOOR_MANAGER, true);
  assert.equal(def.defaults.ASSISTANT_MANAGER, true);
  assert.equal(def.defaults.STAFF, false);
});
