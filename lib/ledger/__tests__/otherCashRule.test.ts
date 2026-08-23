import { test } from "node:test";
import assert from "node:assert/strict";
import { requiresOtherCashReason } from "../otherCashRule";

test("no reason needed when nothing was added", () => {
  assert.equal(requiresOtherCashReason(0), false);
});

test("a real amount needs a reason", () => {
  assert.equal(requiresOtherCashReason(150), true);
  assert.equal(requiresOtherCashReason(0.01), true);
});

test("taking money out needs a reason just as much as putting it in", () => {
  // A negative adjustment moves the expected balance exactly as far as a
  // positive one; an unexplained withdrawal is arguably the more suspicious
  // of the two.
  assert.equal(requiresOtherCashReason(-40), true);
  assert.equal(requiresOtherCashReason(-0.01), true);
});

test("a float rounding artefact is not treated as added cash", () => {
  // The amount arrives from a number input as a float. Without the epsilon
  // this would demand a reason nobody can give, and block the day.
  assert.equal(requiresOtherCashReason(0.1 + 0.2 - 0.3), false);
  assert.equal(requiresOtherCashReason(0.001), false);
  assert.equal(requiresOtherCashReason(-0.001), false);
});

test("a non-finite amount never demands a reason", () => {
  // An empty or half-typed input yields NaN. The amount itself is rejected
  // elsewhere; this rule must not turn that into a confusing second error
  // about a missing reason.
  assert.equal(requiresOtherCashReason(NaN), false);
  assert.equal(requiresOtherCashReason(Infinity), false);
});
