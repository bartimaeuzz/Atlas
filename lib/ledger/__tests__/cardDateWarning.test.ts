import { test } from "node:test";
import assert from "node:assert/strict";
import { transactionDateWarning } from "../cardDateWarning";

const START = "2026-07-15";
const END = "2026-08-14";

test("in-range date is fine", () => {
  assert.equal(transactionDateWarning("2026-07-20", START, END), null);
  assert.equal(transactionDateWarning(START, START, END), null);
  assert.equal(transactionDateWarning(END, START, END), null);
});

test("a few days before period start is fine (late-posting charge)", () => {
  assert.equal(transactionDateWarning("2026-07-10", START, END), null);
});

test("exactly 45 days before start is fine, 46 warns", () => {
  // 2026-07-15 minus 45 days = 2026-05-31
  assert.equal(transactionDateWarning("2026-05-31", START, END), null);
  assert.match(transactionDateWarning("2026-05-30", START, END) ?? "", /6 weeks/);
});

test("after period end warns and names the end date", () => {
  const w = transactionDateWarning("2026-08-15", START, END);
  assert.ok(w);
  assert.ok(w.includes(END));
  assert.match(w, /next statement/);
});

test("Dec-Jan straddle: early-warning boundary crosses the year", () => {
  // period 2026-01-10 .. 2026-02-09; start minus 45 days = 2025-11-26
  assert.equal(transactionDateWarning("2025-11-26", "2026-01-10", "2026-02-09"), null);
  assert.match(transactionDateWarning("2025-11-25", "2026-01-10", "2026-02-09") ?? "", /6 weeks/);
});

test("empty or partial input never warns", () => {
  assert.equal(transactionDateWarning("", START, END), null);
  assert.equal(transactionDateWarning("2026-07", START, END), null);
  assert.equal(transactionDateWarning("07/20/2026", START, END), null);
});

test("malformed period bounds never warn", () => {
  assert.equal(transactionDateWarning("2026-07-20", "", END), null);
  assert.equal(transactionDateWarning("2026-09-01", START, ""), null);
});
