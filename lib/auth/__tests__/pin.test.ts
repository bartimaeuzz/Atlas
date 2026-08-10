import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin } from "../pin";

test("pin: hashPin + verifyPin round trip succeeds for the correct PIN", () => {
  const stored = hashPin("1234");
  assert.equal(verifyPin("1234", stored), true);
});

test("pin: verifyPin rejects a wrong PIN", () => {
  const stored = hashPin("1234");
  assert.equal(verifyPin("9999", stored), false);
});

test("pin: two hashes of the same PIN are different (salted)", () => {
  const a = hashPin("1234");
  const b = hashPin("1234");
  assert.notEqual(a, b);
  // ...but both still verify correctly against their own hash.
  assert.equal(verifyPin("1234", a), true);
  assert.equal(verifyPin("1234", b), true);
});

test("pin: verifyPin returns false (not throws) for a malformed stored hash", () => {
  assert.equal(verifyPin("1234", "not-a-real-hash"), false);
  assert.equal(verifyPin("1234", ""), false);
});

test("pin: empty PIN still hashes/verifies consistently (validation for 'must be non-empty' happens at the form layer, not here)", () => {
  const stored = hashPin("");
  assert.equal(verifyPin("", stored), true);
  assert.equal(verifyPin("0000", stored), false);
});
