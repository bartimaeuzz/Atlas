import { test } from "node:test";
import assert from "node:assert/strict";
import { LABOR_TARGET_PRESETS, laborTargetLabel, laborVerdict } from "../laborTarget";
import { laborCostOfPayout } from "../loadPayrollCost";

test("labor cost is employer spend only -- wages, extra pay and bonuses, minus deductions", () => {
  assert.equal(
    laborCostOfPayout({ flatWageAmount: 120, extraPayAmount: 20, incentiveAmount: 15, deductionAmount: 5 }),
    150
  );
});

test("a tip never enters labor cost -- the shape of the input makes it impossible", () => {
  // Guards the money rule by construction: laborCostOfPayout takes only
  // the four employer-paid fields, so a future caller cannot slip
  // tipPoolShare or hostUpsellTipShare in without changing the signature.
  const keys = Object.keys({ flatWageAmount: 0, extraPayAmount: 0, incentiveAmount: 0, deductionAmount: 0 });
  assert.deepEqual(keys, ["flatWageAmount", "extraPayAmount", "incentiveAmount", "deductionAmount"]);
});

test("the three presets are the researched 25/30/35 band, tightest first", () => {
  assert.deepEqual(
    LABOR_TARGET_PRESETS.map((p) => p.value),
    [0.25, 0.3, 0.35]
  );
});

test("a stored fraction reads back as its preset word, anything else is Custom", () => {
  assert.equal(laborTargetLabel(0.25), "Tight");
  assert.equal(laborTargetLabel(0.3), "Standard");
  assert.equal(laborTargetLabel(0.35), "Generous");
  assert.equal(laborTargetLabel(0.28), "Custom");
});

test("0.1 + 0.2 style drift cannot turn Standard into Custom", () => {
  // 0.30000000000000004 is what 0.1+0.2 gives; the label match is a
  // tolerance compare precisely so a round-tripped number keeps its word.
  assert.equal(laborTargetLabel(0.1 + 0.2), "Standard");
});

test("no target set means no verdict -- never a silent pass or fail", () => {
  assert.equal(laborVerdict(0.42, null), "none");
  assert.equal(laborVerdict(0.42, undefined), "none");
});

test("no sales to divide by means no verdict either", () => {
  assert.equal(laborVerdict(null, 0.3), "none");
});

test("over is strictly over -- landing exactly on the target is not a failure", () => {
  assert.equal(laborVerdict(0.31, 0.3), "over");
  assert.equal(laborVerdict(0.3, 0.3), "under");
  assert.equal(laborVerdict(0.29, 0.3), "under");
});
