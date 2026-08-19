import { test } from "node:test";
import assert from "node:assert/strict";
import { isRowCurrentlyGranted } from "../capabilities";

test("capabilities guard: not granted at all -> false regardless of expiry", () => {
  assert.equal(isRowCurrentlyGranted({ granted: false, expiresAt: null }), false);
  assert.equal(isRowCurrentlyGranted({ granted: false, expiresAt: "2099-01-01" }), false);
});

test("capabilities guard: granted with no expiry -> true", () => {
  assert.equal(isRowCurrentlyGranted({ granted: true, expiresAt: null }), true);
});

test("capabilities guard: granted with a future expiry -> true", () => {
  assert.equal(isRowCurrentlyGranted({ granted: true, expiresAt: "2099-01-01" }), true);
});

test("capabilities guard: granted with a past expiry -> false", () => {
  assert.equal(isRowCurrentlyGranted({ granted: true, expiresAt: "2020-01-01" }), false);
});
