import { test } from "node:test";
import assert from "node:assert/strict";
import { logMoney } from "../log";

test("logMoney writes a plain, stable amount", () => {
  assert.equal(logMoney(56), "$56.00");
  assert.equal(logMoney(0), "$0.00");
  assert.equal(logMoney(1234.5), "$1234.50");
});

test("logMoney puts the minus before the dollar sign", () => {
  // Same convention as the UI's formatMoney, and the same bug fixed across
  // the report tables on 2026-08-22: a negative must never read "$-12.34".
  assert.equal(logMoney(-12.34), "-$12.34");
});

test("logMoney is deliberately separate from the UI formatter", () => {
  // No thousands separators. A log line is a stored record, not a rendered
  // view, and must not change shape when the UI's money formatting does.
  assert.equal(logMoney(1000000), "$1000000.00");
});
