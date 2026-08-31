import { test } from "node:test";
import assert from "node:assert/strict";
import { splitByWeights } from "@/app/(protected)/ledger/card/SplitPartsEditor";

// The Splitwise-style % / shares modes (2026-08-31) both funnel through
// this: dollar parts must always sum EXACTLY to the original line.
test("splitByWeights: equal 3-way split of $100.00 is cent-exact", () => {
  const cents = splitByWeights(10000, [1, 1, 1]);
  assert.deepEqual(cents, [3334, 3333, 3333]);
  assert.equal(cents.reduce((a, b) => a + b, 0), 10000);
});

test("splitByWeights: 2:1 shares", () => {
  assert.deepEqual(splitByWeights(9000, [2, 1]), [6000, 3000]);
});

test("splitByWeights: percent weights (50/30/20)", () => {
  const cents = splitByWeights(12345, [50, 30, 20]);
  assert.equal(cents.reduce((a, b) => a + b, 0), 12345);
  assert.deepEqual(cents, [6173, 3703, 2469]);
});

test("splitByWeights: zero-weight parts get nothing", () => {
  assert.deepEqual(splitByWeights(5000, [1, 0, 1]), [2500, 0, 2500]);
});

test("splitByWeights: all-zero weights → all zero, no division blowup", () => {
  assert.deepEqual(splitByWeights(5000, [0, 0]), [0, 0]);
});
