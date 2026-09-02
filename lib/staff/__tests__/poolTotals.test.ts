import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSlice, poolTotalsFor, type PoolContributor } from "../poolTotals";

const c = (employeeId: number, p1: number, p2: number, cat: "FOH" | "BOH", hidden = false): PoolContributor => ({
  employeeId,
  pool1Share: p1,
  pool2Share: p2,
  pool3Share: 0,
  positionCategory: cat,
  earningsHiddenFromStaff: hidden,
});

const open = { seesEverything: false, showPeerTipFOH: true, showPeerTipBOH: true };

test("poolTotalsFor: sums every member's share per pool, rounded to cents", () => {
  const t = poolTotalsFor(1, [c(1, 156, 0, "FOH"), c(2, 117.005, 20.1, "FOH"), c(3, 0, 9.9, "FOH")], open);
  assert.deepEqual(t, { pool1Total: 273.01, pool2Total: 30, pool3Total: null });
});

test("poolTotalsFor: a pool nobody was in is null, not 0", () => {
  assert.deepEqual(poolTotalsFor(1, [], open), { pool1Total: null, pool2Total: null, pool3Total: null });
});

test("poolTotalsFor: hidden when another member's side has peer tips off (Host + BOH Packers in pool 2)", () => {
  const rows = [c(1, 0, 0.61, "FOH"), c(2, 0, 0.61, "FOH"), c(3, 0, 3.02, "BOH"), c(4, 0, 3.02, "BOH")];
  const vis = { seesEverything: false, showPeerTipFOH: true, showPeerTipBOH: false };
  assert.equal(poolTotalsFor(1, rows, vis).pool2Total, null);
  // Flip the BOH setting on and the same pool becomes visible.
  assert.equal(poolTotalsFor(1, rows, { ...vis, showPeerTipBOH: true }).pool2Total, 7.26);
});

test("poolTotalsFor: the viewer's OWN category does not gate the pool, only the others' do", () => {
  const rows = [c(1, 100, 0, "BOH"), c(2, 50, 0, "FOH")];
  const vis = { seesEverything: false, showPeerTipFOH: true, showPeerTipBOH: false };
  assert.equal(poolTotalsFor(1, rows, vis).pool1Total, 150);
});

test("poolTotalsFor: an earnings-hidden member hides the pool; a manager sees it anyway", () => {
  const rows = [c(1, 100, 0, "FOH"), c(2, 50, 0, "FOH", true)];
  assert.equal(poolTotalsFor(1, rows, open).pool1Total, null);
  assert.equal(poolTotalsFor(1, rows, { ...open, seesEverything: true }).pool1Total, 150);
});

test("poolTotalsFor: a solo member sees their own pool", () => {
  assert.equal(poolTotalsFor(1, [c(1, 19.1, 0, "FOH")], { seesEverything: false, showPeerTipFOH: false, showPeerTipBOH: false }).pool1Total, 19.1);
});

test("formatSlice: one decimal, <0.1% for a tiny real slice, null for an empty pool", () => {
  assert.equal(formatSlice(156, 1482), "10.5%");
  assert.equal(formatSlice(50, 50), "100.0%");
  assert.equal(formatSlice(0.3, 2841), "<0.1%");
  assert.equal(formatSlice(0, 0), null);
});
