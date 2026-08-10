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
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: null,
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
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 40,
    deliveryToastTip: 0,
    hostDrinkBonus: null,
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
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: null,
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
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 0,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: null,
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

test("finalize: split method is configurable per pool, not just Pool 3's default", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 50, tipPoolGroups: ["POOL_2_TAKEOUT_ONLINE"], pointValue: 1.0, flatWage: null },
    { employeeId: 51, tipPoolGroups: ["POOL_2_TAKEOUT_ONLINE"], pointValue: 0.5, flatWage: null },
  ];

  // Same roster, Pool 2 flipped from its usual POINT_WEIGHTED to EQUAL_SPLIT.
  const result = buildFinalizationResult({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "EQUAL_SPLIT",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 0,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: null,
    platformCourierTips: 100,
    platformDeliveryTips: 0,
    roster,
  });

  const p1 = result.employeePayouts.find((p) => p.employeeId === 50)!;
  const p2 = result.employeePayouts.find((p) => p.employeeId === 51)!;
  // If this were still point-weighted, 1.0 vs 0.5 would split 66.67/33.33.
  // With EQUAL_SPLIT it's 50/50 despite the uneven point values.
  assert.equal(p1.tipPoolShare, 50);
  assert.equal(p2.tipPoolShare, 50);
});

test("finalize: pool 3 (delivery) is split equally by default, regardless of point value", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 30, tipPoolGroups: ["POOL_3_DELIVERY"], pointValue: 1.0, flatWage: null },
    { employeeId: 31, tipPoolGroups: ["POOL_3_DELIVERY"], pointValue: 1.0, flatWage: null },
  ];

  const result = buildFinalizationResult({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 100,
    hostDrinkBonus: null,
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

test("finalize: host drink bonus is pulled off Pool 1 top and added to that host's payout", () => {
  // Erika (Host) working alone: host team's shared count is 3 drinks at
  // $1/drink = $3 bonus, pulled off the top of Pool 1 before the
  // point-weighted split, paid 100% to her (sole recipient) — additive on
  // top of her normal Pool 1 share, not instead of it. Kris (Server) gets
  // a share of what's left, no bonus (not a Host).
  const roster: FinalizeRosterRow[] = [
    { employeeId: 10, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: 55 }, // Erika, Host
    { employeeId: 20, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: 60 }, // Kris, Server
  ];

  const result = buildFinalizationResult({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: { qualifyingDrinkCount: 3, perDrinkAmount: 1, recipientEmployeeIds: [10] },
    platformCourierTips: 0,
    platformDeliveryTips: 0,
    roster,
  });

  const erika = result.employeePayouts.find((p) => p.employeeId === 10)!;
  const kris = result.employeePayouts.find((p) => p.employeeId === 20)!;

  assert.equal(result.tipPoolCalculation.totalHostUpsellTip, 3);
  // $100 pool, minus $3 bonus off the top = $97 split 50/50 by equal points.
  assert.equal(round2(erika.tipPoolShare + kris.tipPoolShare), 97);
  assert.equal(erika.tipPoolShare, kris.tipPoolShare); // equal points, equal pool share
  assert.equal(erika.hostUpsellTipShare, 3);
  assert.equal(kris.hostUpsellTipShare, 0);
  // Erika's total is her pool share PLUS the bonus PLUS her wage — additive, not either/or.
  assert.equal(erika.totalCorePayout, round2(erika.tipPoolShare + 3 + 55));
});

test("finalize: host drink bonus splits equally between TWO hosts working the same shift", () => {
  // Erika and Alesso both worked Host this shift — one shared count of 6
  // drinks x $1 = $6, split equally ($3 each), regardless of their
  // (unequal) Pool 1 point values. Corrected 2026-08-10: the original
  // version had each host self-report their own count; the real rule is
  // one pooled waiting-area count for the whole host team.
  const roster: FinalizeRosterRow[] = [
    { employeeId: 10, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: 55 }, // Erika, Host
    { employeeId: 11, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 0.5, flatWage: 55 }, // Alesso, also Host today
  ];

  const result = buildFinalizationResult({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 0,
    deliveryToastTip: 0,
    hostDrinkBonus: { qualifyingDrinkCount: 6, perDrinkAmount: 1, recipientEmployeeIds: [10, 11] },
    platformCourierTips: 0,
    platformDeliveryTips: 0,
    roster,
  });

  const erika = result.employeePayouts.find((p) => p.employeeId === 10)!;
  const alesso = result.employeePayouts.find((p) => p.employeeId === 11)!;

  assert.equal(result.tipPoolCalculation.totalHostUpsellTip, 6);
  assert.equal(erika.hostUpsellTipShare, 3);
  assert.equal(alesso.hostUpsellTipShare, 3); // equal split despite 1.0 vs 0.5 point values
  // Their normal Pool 1 shares still differ by point value — only the
  // drink bonus is forced equal, not their whole payout.
  assert.ok(erika.tipPoolShare > alesso.tipPoolShare);
});

test("finalize: host drink bonus larger than the pool throws a friendly error, doesn't silently clamp", () => {
  const roster: FinalizeRosterRow[] = [
    { employeeId: 10, tipPoolGroups: ["POOL_1_DINE_IN"], pointValue: 1.0, flatWage: null },
  ];

  assert.throws(
    () =>
      buildFinalizationResult({
        deductionRate: 0,
        pool1SplitMethod: "POINT_WEIGHTED",
        pool2SplitMethod: "POINT_WEIGHTED",
        pool3SplitMethod: "EQUAL_SPLIT",
        grossCcTip: 10,
        takeoutCcTip: 0,
        deliveryToastTip: 0,
        hostDrinkBonus: { qualifyingDrinkCount: 20, perDrinkAmount: 1, recipientEmployeeIds: [10] }, // $20 bonus > $10 pool
        platformCourierTips: 0,
        platformDeliveryTips: 0,
        roster,
      }),
    /more than this shift's dine-in tip pool/
  );
});
