import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRecoveryCodePlaintext, normalizeRecoveryCodeInput } from "../recoveryCode";

test("recoveryCode: generates 4 groups of 4 characters separated by dashes", () => {
  const code = generateRecoveryCodePlaintext();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("recoveryCode: never contains ambiguous characters 0/O/1/I/L", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateRecoveryCodePlaintext();
    assert.doesNotMatch(code, /[01OIL]/);
  }
});

test("recoveryCode: two generated codes are (almost certainly) different", () => {
  const a = generateRecoveryCodePlaintext();
  const b = generateRecoveryCodePlaintext();
  assert.notEqual(a, b);
});

test("normalizeRecoveryCodeInput: uppercases and strips dashes/whitespace", () => {
  assert.equal(normalizeRecoveryCodeInput("kxqp-7rt4-m2wl-9f3h"), "KXQP7RT4M2WL9F3H");
  assert.equal(normalizeRecoveryCodeInput("KXQP 7RT4 M2WL 9F3H"), "KXQP7RT4M2WL9F3H");
  assert.equal(normalizeRecoveryCodeInput("KXQP-7RT4-M2WL-9F3H"), "KXQP7RT4M2WL9F3H");
});

test("normalizeRecoveryCodeInput: a generated code round-trips through normalize+dash-strip identically regardless of formatting", () => {
  const code = generateRecoveryCodePlaintext();
  const noDashes = code.replace(/-/g, "");
  assert.equal(normalizeRecoveryCodeInput(code), noDashes);
  assert.equal(normalizeRecoveryCodeInput(code.toLowerCase()), noDashes);
  assert.equal(normalizeRecoveryCodeInput(code.replace(/-/g, " ")), noDashes);
});
