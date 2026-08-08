import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTwoPoolTips } from "../tipPool";
import { calculateFlatWage } from "../flatWage";

test("Pool 1: takeout tip is carved out before the dine-in deduction, not double counted", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 45,
    hostDrinkBonus: [],
    pool1Roster: [{ employeeId: 1, pointValue: 1.0 }],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  assert.equal(result.pool1.grossDineInCcTip, 585); // 630 - 45
  assert.equal(result.pool1.netDineInCcTip, 558.68); // 585 * 0.955 = 558.675, rounds up
});

test("Pool 1: host drink bonus is pulled off the top before the point-weighted split", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 0,
    hostDrinkBonus: [{ employeeId: 5, qualifyingDrinkCount: 4, perDrinkAmount: 1 }], // Erika sold 4 drinks
    pool1Roster: [
      { employeeId: 1, pointValue: 1.0 },
      { employeeId: 5, pointValue: 1.0 }, // Erika also shares the remaining pool
    ],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  assert.equal(result.pool1.totalHostDrinkBonus, 4);
  assert.equal(result.hostDrinkBonusByEmployee[5], 4);
  assert.equal(result.pool1.netPool1AfterHostBonus, round2(630 * 0.955 - 4));
});

test("Pool 1: host earns from the drink bonus AND their normal point-weighted share — additive, not either/or", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 0,
    hostDrinkBonus: [{ employeeId: 5, qualifyingDrinkCount: 4, perDrinkAmount: 1 }],
    pool1Roster: [
      { employeeId: 1, pointValue: 1.0 },
      { employeeId: 5, pointValue: 1.2 }, // Erika's point value bumped +0.2 for good upsell work
    ],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  assert.equal(result.hostDrinkBonusByEmployee[5], 4);
  assert.ok(result.pool1.shareByEmployee[5] > 0);
  assert.ok(result.pool1.shareByEmployee[5] > result.pool1.shareByEmployee[1]); // bumped point value pays off
});

test("Pool 1: throws rather than going negative if the drink bonus would exceed the pool", () => {
  assert.throws(() =>
    calculateTwoPoolTips({
      deductionRate: 0.045,
      pool1SplitMethod: "POINT_WEIGHTED",
      pool2SplitMethod: "POINT_WEIGHTED",
      pool3SplitMethod: "EQUAL_SPLIT",
      grossCcTip: 10,
      takeoutCcTip: 0,
      hostDrinkBonus: [{ employeeId: 5, qualifyingDrinkCount: 50, perDrinkAmount: 1 }],
      pool1Roster: [{ employeeId: 5, pointValue: 1.0 }],
      platformCourierTips: 0,
      pool2Roster: [],
      deliveryToastTip: 0,
      platformDeliveryTips: 0,
      pool3Roster: [],
    })
  );
});

test("Pool 2: takeout tip gets the deduction, online-platform tips do not", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 45,
    hostDrinkBonus: [],
    pool1Roster: [{ employeeId: 1, pointValue: 1.0 }],
    platformCourierTips: 100,
    pool2Roster: [{ employeeId: 5, pointValue: 1.0 }], // Host in Pool 2
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  assert.equal(result.pool2.netTakeoutCcTip, round2(45 * 0.955)); // 42.98
  assert.equal(result.pool2.platformCourierTips, 100); // untouched
  assert.equal(result.pool2.totalPool2, round2(42.975 + 100));
});

test("Pool 2: Host shares Pool 2 with Operator/Packer/Bag Handler — even if some of those roles have zero people", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 0,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: [],
    platformCourierTips: 200,
    pool2Roster: [{ employeeId: 5, pointValue: 1.0 }], // only Host staffed today, no Operator/Packer/BagHandler yet
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  assert.equal(result.pool2.shareByEmployee[5], 200); // Host gets the whole pool alone
});

test("Pool 3: Delivery Guy tips are split EQUALLY, not by point value, even if points differ", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 0,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: [],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 90,
    pool3Roster: [10, 11, 12].map((employeeId) => ({ employeeId, pointValue: 1.0 })), // three delivery guys on shift
  });
  assert.equal(result.pool3.shareByEmployee[10], 30);
  assert.equal(result.pool3.shareByEmployee[11], 30);
  assert.equal(result.pool3.shareByEmployee[12], 30);
});

test("Pool 3: Toast delivery tip gets the 4.5% deduction, platform-delivered tip does not", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 100,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: [],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 100,
    platformDeliveryTips: 50,
    pool3Roster: [10].map((employeeId) => ({ employeeId, pointValue: 1.0 })),
  });
  assert.equal(result.pool3.netDeliveryToastTip, round2(100 * 0.955)); // 95.5
  assert.equal(result.pool3.platformDeliveryTips, 50);
  assert.equal(result.pool3.totalPool3, round2(95.5 + 50));
});

test("rejects takeoutCcTip + deliveryToastTip greater than grossCcTip", () => {
  assert.throws(() =>
    calculateTwoPoolTips({
      deductionRate: 0.045,
      pool1SplitMethod: "POINT_WEIGHTED",
      pool2SplitMethod: "POINT_WEIGHTED",
      pool3SplitMethod: "EQUAL_SPLIT",
      grossCcTip: 10,
      takeoutCcTip: 6,
      hostDrinkBonus: [],
      pool1Roster: [],
      platformCourierTips: 0,
      pool2Roster: [],
      deliveryToastTip: 6,
      platformDeliveryTips: 0,
      pool3Roster: [],
    })
  );
});

test("Both pools reconcile exactly to the cent even with uneven points", () => {
  const result = calculateTwoPoolTips({
    deductionRate: 0.045,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 630,
    takeoutCcTip: 45,
    hostDrinkBonus: [{ employeeId: 5, qualifyingDrinkCount: 3, perDrinkAmount: 1 }],
    pool1Roster: [
      { employeeId: 1, pointValue: 1.0 },
      { employeeId: 2, pointValue: 0.8 },
      { employeeId: 3, pointValue: 1.0 },
      { employeeId: 4, pointValue: 1.0 },
      { employeeId: 5, pointValue: 1.0 },
      { employeeId: 6, pointValue: 1.0 }, // busser
    ],
    platformCourierTips: 87.33,
    pool2Roster: [
      { employeeId: 5, pointValue: 1.0 },
      { employeeId: 7, pointValue: 1.0 },
    ],
    deliveryToastTip: 33,
    platformDeliveryTips: 61.5,
    pool3Roster: [8, 9, 20].map((employeeId) => ({ employeeId, pointValue: 1.0 })),
  });
  const pool1Total = Object.values(result.pool1.shareByEmployee).reduce((a, b) => a + b, 0);
  const pool2Total = Object.values(result.pool2.shareByEmployee).reduce((a, b) => a + b, 0);
  const pool3Total = Object.values(result.pool3.shareByEmployee).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(pool1Total * 100), Math.round(result.pool1.netPool1AfterHostBonus * 100));
  assert.equal(Math.round(pool2Total * 100), Math.round(result.pool2.totalPool2 * 100));
  assert.equal(Math.round(pool3Total * 100), Math.round(result.pool3.totalPool3 * 100));
});

test("rejects takeoutCcTip greater than grossCcTip", () => {
  assert.throws(() =>
    calculateTwoPoolTips({
      deductionRate: 0.045,
      pool1SplitMethod: "POINT_WEIGHTED",
      pool2SplitMethod: "POINT_WEIGHTED",
      pool3SplitMethod: "EQUAL_SPLIT",
      grossCcTip: 10,
      takeoutCcTip: 20,
      hostDrinkBonus: [],
      pool1Roster: [],
      platformCourierTips: 0,
      pool2Roster: [],
      deliveryToastTip: 0,
      platformDeliveryTips: 0,
      pool3Roster: [],
    })
  );
});

test("Pool split method is configurable per pool — EQUAL_SPLIT ignores point value even in Pool 1", () => {
  const roster = [
    { employeeId: 1, pointValue: 1.0 },
    { employeeId: 2, pointValue: 0.5 }, // much lower point value
  ];

  const pointWeighted = calculateTwoPoolTips({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 300,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: roster,
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  // 1.0 vs 0.5 point value -> unequal shares (200 / 100)
  assert.equal(pointWeighted.pool1.shareByEmployee[1], 200);
  assert.equal(pointWeighted.pool1.shareByEmployee[2], 100);

  const equalSplit = calculateTwoPoolTips({
    deductionRate: 0,
    pool1SplitMethod: "EQUAL_SPLIT",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    grossCcTip: 300,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: roster,
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 0,
    pool3Roster: [],
  });
  // same roster, but Pool 1 set to EQUAL_SPLIT -> point value 0.5 no longer matters
  assert.equal(equalSplit.pool1.shareByEmployee[1], 150);
  assert.equal(equalSplit.pool1.shareByEmployee[2], 150);
});

test("Pool split method: Pool 3 can be switched to POINT_WEIGHTED instead of its EQUAL_SPLIT default, and actually uses the point values", () => {
  const roster = [
    { employeeId: 10, pointValue: 1.0 },
    { employeeId: 11, pointValue: 0.5 },
  ];

  const equalSplit = calculateTwoPoolTips({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT", // the default
    grossCcTip: 0,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: [],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 100,
    pool3Roster: roster,
  });
  // EQUAL_SPLIT ignores the 1.0 vs 0.5 difference entirely.
  assert.equal(equalSplit.pool3.shareByEmployee[10], 50);
  assert.equal(equalSplit.pool3.shareByEmployee[11], 50);

  const pointWeighted = calculateTwoPoolTips({
    deductionRate: 0,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "POINT_WEIGHTED", // flipped from the default
    grossCcTip: 0,
    takeoutCcTip: 0,
    hostDrinkBonus: [],
    pool1Roster: [],
    platformCourierTips: 0,
    pool2Roster: [],
    deliveryToastTip: 0,
    platformDeliveryTips: 100,
    pool3Roster: roster,
  });
  // Same roster, same input, only the setting changed — now it matters.
  assert.equal(pointWeighted.pool3.shareByEmployee[10], 66.67);
  assert.equal(pointWeighted.pool3.shareByEmployee[11], 33.33);
});

test("FOH flat wage comes from the shared position rate", () => {
  assert.equal(calculateFlatWage({ category: "FOH", positionRate: 70 }), 70);
});

test("BOH flat wage comes from the individual employee rate, not a shared position rate", () => {
  assert.equal(calculateFlatWage({ category: "BOH", employeeRate: 40 }), 40);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
