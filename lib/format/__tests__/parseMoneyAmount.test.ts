import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyAmount } from "../parseMoneyAmount";
import { groupThousands } from "../groupThousands";

test("the comma the field itself displays parses back to the same number", () => {
  // This is the whole point of the function. Before it existed, every
  // action did Number(raw), and Number("18,500") is NaN — so a comma in
  // the box meant "Amount must be a positive number" and no save.
  assert.equal(parseMoneyAmount("18,500"), 18500);
  assert.equal(parseMoneyAmount("1,000,000"), 1000000);
  assert.equal(parseMoneyAmount("3,800.50"), 3800.5);
});

test("round trip: whatever the field shows, the action reads back", () => {
  for (const stored of [0.05, 12.5, 999, 1000, 18500, 3800.5, 1234567.89]) {
    assert.equal(parseMoneyAmount(groupThousands(String(stored))), stored);
  }
});

test("the other things managers actually type", () => {
  assert.equal(parseMoneyAmount("$3,800"), 3800);
  assert.equal(parseMoneyAmount(" 42 "), 42);
  assert.equal(parseMoneyAmount("$ 1,2 34.56"), 1234.56);
  assert.equal(parseMoneyAmount("3800"), 3800);
});

test("negatives survive — a card credit is a negative amount", () => {
  assert.equal(parseMoneyAmount("-1,200"), -1200);
  assert.equal(parseMoneyAmount("-45.25"), -45.25);
});

test("cents rounding replaces the browser's step=0.01", () => {
  // A text box cannot enforce step, so the guard moved here rather than
  // vanishing when the fields stopped being type="number".
  assert.equal(parseMoneyAmount("12.345"), 12.35);
  assert.equal(parseMoneyAmount("0.005"), 0.01);
  assert.equal(parseMoneyAmount("1,000.999"), 1001);
});

test("nothing is guessed — blank and junk come back NaN for the caller to judge", () => {
  // Deliberately NOT 0. Number("") is 0, and an action that treats a blank
  // box as zero dollars is how a day gets closed with a fabricated count.
  assert.ok(Number.isNaN(parseMoneyAmount("")));
  assert.ok(Number.isNaN(parseMoneyAmount("   ")));
  assert.ok(Number.isNaN(parseMoneyAmount(null)));
  assert.ok(Number.isNaN(parseMoneyAmount(undefined)));
  assert.ok(Number.isNaN(parseMoneyAmount("abc")));
  assert.ok(Number.isNaN(parseMoneyAmount("12.3.4")));
  assert.ok(Number.isNaN(parseMoneyAmount("$")));
});

test("zero is a real answer, not a blank", () => {
  // A statement with no payments or refunds legitimately posts 0.
  assert.equal(parseMoneyAmount("0"), 0);
  assert.equal(parseMoneyAmount("0.00"), 0);
});
