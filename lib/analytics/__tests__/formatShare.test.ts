import { test } from "node:test";
import assert from "node:assert/strict";
import { formatShare } from "../formatShare";

test("ordinary shares render as one decimal, matching the KPI cards", () => {
  assert.equal(formatShare(1), "100.0%");
  assert.equal(formatShare(0.25), "25.0%");
  assert.equal(formatShare(0.766), "76.6%");
  assert.equal(formatShare(0.012), "1.2%");
});

test("no revenue to divide by renders an em dash, not a percentage", () => {
  assert.equal(formatShare(null), "—");
});

test("a real but tiny cost says '<0.1%', never '0.0%' -- the live $16 drinks line", () => {
  // 16 / 211385.33, the actual figure on the deployed page 2026-08-30.
  assert.equal(formatShare(16 / 211385.33), "<0.1%");
  assert.equal(formatShare(0.0004), "<0.1%");
  // Just inside the rounding boundary is still a real number, not nothing.
  assert.equal(formatShare(0.00049), "<0.1%");
  // Just outside it rounds normally.
  assert.equal(formatShare(0.0006), "0.1%");
});

test("an exact zero is still 0.0% -- there, nothing IS the fact", () => {
  assert.equal(formatShare(0), "0.0%");
});

test("a signed zero can never be produced: '-0.0%' is not a reachable output", () => {
  // (-0.0076).toFixed(1) === "-0.0" if the sign survives rounding.
  assert.equal(formatShare(-0.000076), "-<0.1%");
  assert.equal(formatShare(-0.0004), "-<0.1%");
  assert.equal(formatShare(-0.2), "-20.0%");
});
