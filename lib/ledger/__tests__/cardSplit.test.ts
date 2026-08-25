import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSplitParts, isSplitFailure, type SplitPart } from "../cardSplit";

function ok(r: ReturnType<typeof validateSplitParts>): SplitPart[] {
  assert.ok(!isSplitFailure(r), `expected parts, got failure: ${isSplitFailure(r) ? r.failure : ""}`);
  return (r as { parts: SplitPart[] }).parts;
}

function fail(r: ReturnType<typeof validateSplitParts>): string {
  assert.ok(isSplitFailure(r), "expected a failure");
  return (r as { failure: string }).failure;
}

test("fewer than two parts fails", () => {
  assert.match(fail(validateSplitParts([], null)), /at least two/);
  assert.match(fail(validateSplitParts([{ categoryId: 1, amount: 5 }], null)), /at least two/);
  assert.match(fail(validateSplitParts("nope", null)), /at least two/);
});

test("zero, NaN, or missing amounts fail", () => {
  assert.match(fail(validateSplitParts([{ categoryId: 1, amount: 0 }, { categoryId: 2, amount: 5 }], null)), /nonzero/);
  assert.match(fail(validateSplitParts([{ categoryId: 1, amount: NaN }, { categoryId: 2, amount: 5 }], null)), /nonzero/);
  // 0.001 rounds to zero cents
  assert.match(fail(validateSplitParts([{ categoryId: 1, amount: 0.001 }, { categoryId: 2, amount: 5 }], null)), /nonzero/);
});

test("missing or bad categoryId fails", () => {
  assert.match(fail(validateSplitParts([{ amount: 5 }, { categoryId: 2, amount: 5 }], null)), /category/);
  assert.match(fail(validateSplitParts([{ categoryId: 0, amount: 5 }, { categoryId: 2, amount: 5 }], null)), /category/);
  assert.match(fail(validateSplitParts([{ categoryId: 1.5, amount: 5 }, { categoryId: 2, amount: 5 }], null)), /category/);
});

test("memo is trimmed, sliced to 500, and nulled when empty", () => {
  const parts = ok(
    validateSplitParts(
      [
        { categoryId: 1, amount: 5, memo: "  Amazon (split)  " },
        { categoryId: 2, amount: 5, memo: "   " },
        { categoryId: 3, amount: 5, memo: "x".repeat(600) },
      ],
      null
    )
  );
  assert.equal(parts[0].memo, "Amazon (split)");
  assert.equal(parts[1].memo, null);
  assert.equal(parts[2].memo?.length, 500);
});

test("exact-cents sum passes: the 3.33+3.33+3.34 float trap", () => {
  const parts = ok(
    validateSplitParts(
      [
        { categoryId: 1, amount: 3.33 },
        { categoryId: 2, amount: 3.33 },
        { categoryId: 3, amount: 3.34 },
      ],
      10.0
    )
  );
  assert.equal(parts.length, 3);
});

test("float-noise inputs round to cents before comparing", () => {
  // 0.1 + 0.2 !== 0.3 in floats; in cents it must pass.
  ok(validateSplitParts([{ categoryId: 1, amount: 0.1 }, { categoryId: 2, amount: 0.2 }], 0.3));
});

test("off by a cent fails and names both dollar figures", () => {
  const msg = fail(validateSplitParts([{ categoryId: 1, amount: 3.33 }, { categoryId: 2, amount: 6.66 }], 10.0));
  assert.ok(msg.includes("$10.00"));
  assert.ok(msg.includes("$9.99"));
});

test("negative (credit) line splits into negative parts", () => {
  ok(validateSplitParts([{ categoryId: 1, amount: -30 }, { categoryId: 2, amount: -15.5 }], -45.5));
});

test("mixed-sign parts must still sum to the original", () => {
  ok(validateSplitParts([{ categoryId: 1, amount: 60 }, { categoryId: 2, amount: -10 }], 50));
});

test("null originalAmount skips the sum check", () => {
  ok(validateSplitParts([{ categoryId: 1, amount: 1 }, { categoryId: 2, amount: 999 }], null));
});
