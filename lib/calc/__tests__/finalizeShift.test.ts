import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinalizationResult, type FinalizeRosterRow } from "../finalizeShift";

function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}

test("finalize: splits pool 1 by point value and attaches wage once per employee", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 1, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: 60 }, // Server
    { employeeId: 2, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 0.8, flatWage: 60 }, // Server
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    grossCcTip: 630,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    platformCourierTips: 0,
    platformDeliveryTips: 0,
    roster,
  });

  const netPool1 = round2(630 * 0.955);
  assert.equal(result.tipPoolCalculation.netGeneralCcTip, netPool1);

  const p1 = result.employeePayouts.find((p) => p.employeeId === 1)!;
  const p2 = result.employeePayouts.find((p) => p.employeeId === 2)!;
  // shares sum back exactly to the pool
  assert.equal(round2(p1.tipPoolShare + p2.tipPoolShare), netPool1);
  // employee 1 has the higher point value, so gets the bigger share
  assert.ok(p1.tipPoolShare > p2.tipPoolShare);
  assert.equal(p1.flatWageAmount, 60);
  assert.equal(p1.totalCorePayout, round2(p1.tipPoolShare + 60));
});

test("finalize: one row spanning two pools (Host) gets summed share AND a defined pointValueUsed", () => {
  // Host is modeled as ONE roster row whose position belongs to both Pool 1
  // and Pool 2 (see db/schema.ts positionTipPools) — fixed 2026-08-08 after
  // the old two-separate-rows model let a manager forget the Pool 2 row.
  const roster: FinalizeRosterRow[] = [
    { employeeId: 10, tipPoolGroups: ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE"], pointValue: 0.5, flatWage: 55 },
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    grossCcTip: 100,
    takeoutCcTip: 40,
    deliveryToastTip: 0,
    platformCourierTips: 20,
    platformDeliveryTips: 0,
    roster,
  });

  const payout = result.employeePayouts.find((p) => p.employeeId === 10)!;
  // sole member of both pools -> gets 100% of pool1 + 100% of pool2, and the
  // point value is unambiguous now since it's a single roster row.
  assert.equal(payout.pointValueUsed, 0.5);
  const expectedPool1 = round2((100 - 40) * 0.955);
  const expectedPool2 = round2(40 * 0.955 + 20);
  assert.equal(payout.tipPoolShare, round2(expectedPool1 + expectedPool2));
  assert.equal(payout.flatWageAmount, 55);
});

test("finalize: employee with two SEPARATE tip-pool roster rows (different positions) has null pointValueUsed", () => {
  // Distinct from the Host case above — this is someone genuinely covering
  // two different jobs in one shift (e.g. Bartender AND Runner), which is
  // still legitimately ambiguous for a single "point value used" figure.
  const roster: FinalizeRosterRow[] = [
    { employeeId: 40, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: 70 },
    { employeeId: 40, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 0.6, flatWage: null },
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    platformCourierTips: 0,
    platformDeliveryTips: 0,
    roster,
  });

  const payout = result.employeePayouts.find((p) => p.employeeId === 40)!;
  assert.equal(payout.pointValueUsed, null);
  assert.equal(payout.flatWageAmount, 70); // counted once, from the wage-bearing row
});

test("finalize: NONE-pool employee (Manager) still gets a payout row with wage only", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 20, tipPoolGroups: [], pointValue: 1.0, flatWage: 100 },
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    grossCcTip: 0,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    platformCourierTips: 0,
    platformDeliveryTips: 0,
    roster,
  });

  assert.equal(result.employeePayouts.length, 1);
  const payout = result.employeePayouts[0];
  assert.equal(payout.tipPoolShare, 0);
  assert.equal(payout.flatWageAmount, 100);
  assert.equal(payout.totalCorePayout, 100);
  assert.equal(payout.pointValueUsed, null);
});

test("finalize: pool 3 (delivery) is split equally regardless of point value", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 30, tipPoolGroups: ["POOL_3_DELIVERY"], pointValue: 1.0, flatWage: null },
    { employeeId: 31, tipPoolGroups: ["POOL_3_DELIVERY"], pointValue: 1.0, flatWage: null },
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 100,
    platformCourierTips: 0,
    platformDeliveryTips: 50,
    roster,
  });

  const p1 = result.employeePayouts.find((p) => p.employeeId === 30)!;
  const p2 = result.employeePayouts.find((p) => p.employeeId === 31)!;
  assert.equal(p1.tipPoolShare, p2.tipPoolShare);
  const expectedTotal = round2(100 * 0.955 + 50);
  assert.equal(round2(p1.tipPoolShare + p2.tipPoolShare), expectedTotal);
});
