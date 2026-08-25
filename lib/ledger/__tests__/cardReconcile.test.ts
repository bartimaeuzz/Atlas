import { test } from "node:test";
import assert from "node:assert/strict";
import { cardSideTotals, cardSideMatches, cardReconcileMismatch } from "../cardReconcile";

test("cardSideTotals splits signs and rounds in cents", () => {
  const t = cardSideTotals([842.17, -45.5, 12.34, -100]);
  assert.equal(t.chargesLogged, 854.51);
  assert.equal(t.creditsLogged, 145.5);
});

test("cardSideTotals: float noise sums to exact cents", () => {
  // 0.1 + 0.2 must land on 0.30, not 0.30000000000000004
  const t = cardSideTotals([0.1, 0.2]);
  assert.equal(t.chargesLogged, 0.3);
  assert.ok(cardSideMatches(t.chargesLogged, 0.3));
});

test("empty period: both sides zero, matches zero targets", () => {
  const t = cardSideTotals([]);
  assert.equal(cardReconcileMismatch(t, 0, 0), null);
});

test("both sides matching returns null", () => {
  const t = cardSideTotals([100, 50.25, -30]);
  assert.equal(cardReconcileMismatch(t, 150.25, 30), null);
});

test("charges off by a cent names the charges side", () => {
  const t = cardSideTotals([150.24, -30]);
  const msg = cardReconcileMismatch(t, 150.25, 30);
  assert.ok(msg);
  assert.match(msg, /Charges logged/);
  assert.ok(msg.includes("$150.24"));
  assert.ok(msg.includes("$150.25"));
});

test("credits off names the payments side", () => {
  const t = cardSideTotals([150.25, -29]);
  const msg = cardReconcileMismatch(t, 150.25, 30);
  assert.ok(msg);
  assert.match(msg, /Payments & credits logged/);
});

test("both sides off says so with all four figures", () => {
  const t = cardSideTotals([100, -10]);
  const msg = cardReconcileMismatch(t, 200, 20);
  assert.ok(msg);
  assert.match(msg, /Neither side/);
  for (const s of ["$100.00", "$200.00", "$10.00", "$20.00"]) assert.ok(msg.includes(s));
});

test("refund-only period reconciles against the credits target", () => {
  const t = cardSideTotals([-45.5]);
  assert.equal(cardReconcileMismatch(t, 0, 45.5), null);
});

test("payment-only period: bill payment line vs its printed total", () => {
  const t = cardSideTotals([-2500]);
  assert.equal(cardReconcileMismatch(t, 0, 2500), null);
  assert.match(cardReconcileMismatch(t, 0, 2400) ?? "", /Payments & credits/);
});
