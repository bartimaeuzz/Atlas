import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateShiftIncentiveRules, type IncentiveRuleDef, type IncentiveRosterEntry } from "../incentiveRules";

const bohRoster: IncentiveRosterEntry[] = [
  { employeeId: 1, positionId: 10, category: "FOH" }, // Server
  { employeeId: 2, positionId: 11, category: "BOH" }, // Chef
  { employeeId: 3, positionId: 12, category: "BOH" }, // Line Cook
];

function flatBohRule(overrides: Partial<IncentiveRuleDef> = {}): IncentiveRuleDef {
  return {
    id: 1,
    name: "BOH $10k Sales Bonus (test)",
    enabled: true,
    evaluationPeriod: "SHIFT",
    rewardType: "FLAT",
    rewardValue: 20,
    rewardCap: null,
    distributionMethod: "PER_TARGET_FLAT",
    poolSourceMetricKey: null,
    conditions: [{ metricKey: "total_sales", operator: ">=", value: 10000, valueTo: null }],
    targets: [{ targetType: "CATEGORY", targetId: "BOH" }],
    ...overrides,
  };
}

test("incentive rule: flat $20 fires for every BOH employee when total_sales hits the threshold", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule()], { total_sales: 10000 }, bohRoster);
  assert.equal(payouts.length, 2);
  const byEmployee = Object.fromEntries(payouts.map((p) => [p.employeeId, p.amount]));
  assert.equal(byEmployee[2], 20);
  assert.equal(byEmployee[3], 20);
  assert.equal(byEmployee[1], undefined); // FOH not targeted
});

test("incentive rule: does not fire when total_sales is below the threshold", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule()], { total_sales: 9999.99 }, bohRoster);
  assert.equal(payouts.length, 0);
});

test("incentive rule: fires exactly at the threshold (>=)", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule()], { total_sales: 10000 }, bohRoster);
  assert.equal(payouts.length, 2);
});

test("incentive rule: only pays employees actually on the roster this shift (no BOH staffed)", () => {
  const noboh: IncentiveRosterEntry[] = [{ employeeId: 1, positionId: 10, category: "FOH" }];
  const payouts = evaluateShiftIncentiveRules([flatBohRule()], { total_sales: 15000 }, noboh);
  assert.equal(payouts.length, 0);
});

test("incentive rule: disabled rule never fires even if conditions are met", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule({ enabled: false })], { total_sales: 20000 }, bohRoster);
  assert.equal(payouts.length, 0);
});

test("incentive rule: missing metric (metric not entered this shift) is treated as condition not met", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule()], {}, bohRoster);
  assert.equal(payouts.length, 0);
});

test("incentive rule: WEEK/MONTH evaluationPeriod is skipped (deferred scope)", () => {
  const payouts = evaluateShiftIncentiveRules(
    [flatBohRule({ evaluationPeriod: "WEEK" })],
    { total_sales: 50000 },
    bohRoster
  );
  assert.equal(payouts.length, 0);
});

test("incentive rule: PERCENT_OF_METRIC / ADJUST_TIP_POINT rewardType is skipped (deferred scope)", () => {
  const payouts = evaluateShiftIncentiveRules(
    [flatBohRule({ rewardType: "PERCENT_OF_METRIC" })],
    { total_sales: 50000 },
    bohRoster
  );
  assert.equal(payouts.length, 0);
});

test("incentive rule: WEIGHTED_POOL distributionMethod is skipped (deferred scope)", () => {
  const payouts = evaluateShiftIncentiveRules(
    [flatBohRule({ distributionMethod: "WEIGHTED_POOL" })],
    { total_sales: 50000 },
    bohRoster
  );
  assert.equal(payouts.length, 0);
});

test("incentive rule: a rule with zero conditions never fires (treated as unconfigured, not always-true)", () => {
  const payouts = evaluateShiftIncentiveRules([flatBohRule({ conditions: [] })], { total_sales: 50000 }, bohRoster);
  assert.equal(payouts.length, 0);
});

test("incentive rule: POSITION target only pays that specific position", () => {
  const rule = flatBohRule({ targets: [{ targetType: "POSITION", targetId: "12" }] });
  const payouts = evaluateShiftIncentiveRules([rule], { total_sales: 10000 }, bohRoster);
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].employeeId, 3);
});

test("incentive rule: EMPLOYEE target pays that specific employee regardless of category", () => {
  const rule = flatBohRule({ targets: [{ targetType: "EMPLOYEE", targetId: "1" }] });
  const payouts = evaluateShiftIncentiveRules([rule], { total_sales: 10000 }, bohRoster);
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].employeeId, 1);
});

test("incentive rule: 'between' operator", () => {
  const rule = flatBohRule({
    conditions: [{ metricKey: "total_sales", operator: "between", value: 5000, valueTo: 10000 }],
  });
  assert.equal(evaluateShiftIncentiveRules([rule], { total_sales: 7500 }, bohRoster).length, 2);
  assert.equal(evaluateShiftIncentiveRules([rule], { total_sales: 4999 }, bohRoster).length, 0);
  assert.equal(evaluateShiftIncentiveRules([rule], { total_sales: 10001 }, bohRoster).length, 0);
});

test("incentive rule: two rules firing for the same employee produce two separate payout entries (caller sums them)", () => {
  const ruleA = flatBohRule({ id: 1, name: "Rule A", rewardValue: 20 });
  const ruleB = flatBohRule({ id: 2, name: "Rule B", rewardValue: 5 });
  const payouts = evaluateShiftIncentiveRules([ruleA, ruleB], { total_sales: 10000 }, bohRoster);
  const forEmployee2 = payouts.filter((p) => p.employeeId === 2);
  assert.equal(forEmployee2.length, 2);
  assert.equal(forEmployee2.reduce((a, p) => a + p.amount, 0), 25);
});

/* ---- Metric-funded equal-split pools (2026-08-31, the packer bonus) ---- */

const packerRoster: IncentiveRosterEntry[] = [
  { employeeId: 5, positionId: 20, category: "FOH" }, // Packer
  { employeeId: 9, positionId: 20, category: "FOH" }, // Packer
  { employeeId: 1, positionId: 10, category: "FOH" }, // Server
];

function packerRule(overrides: Partial<IncentiveRuleDef> = {}): IncentiveRuleDef {
  return {
    id: 2,
    name: "Packer off-premise bonus (test)",
    enabled: true,
    evaluationPeriod: "SHIFT",
    rewardType: "PERCENT_OF_METRIC",
    rewardValue: 0.01,
    rewardCap: null,
    distributionMethod: "WEIGHTED_POOL",
    poolSourceMetricKey: "off_premise_sales",
    conditions: [{ metricKey: "off_premise_sales", operator: ">", value: 0, valueTo: null }],
    targets: [{ targetType: "POSITION", targetId: "20" }],
    ...overrides,
  };
}

test("packer bonus: 1% of off-premise sales, split equally between two packers", () => {
  // $3,000 off-premise -> $30 pool -> $15 each (Oliver's A: หารกัน,
  // the house pays $30 total however many packers worked).
  const payouts = evaluateShiftIncentiveRules([packerRule()], { off_premise_sales: 3000 }, packerRoster);
  assert.equal(payouts.length, 2);
  assert.deepEqual(payouts.map((p) => p.amount), [15, 15]);
  assert.ok(payouts.every((p) => p.employeeId === 5 || p.employeeId === 9));
});

test("packer bonus: percent mode pays on the exact figure — $199 -> $1.99", () => {
  const solo = packerRoster.slice(0, 1);
  const payouts = evaluateShiftIncentiveRules([packerRule()], { off_premise_sales: 199 }, solo);
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].amount, 1.99);
});

test("packer bonus: per-block mode floors to full $100s — $199 -> $1", () => {
  const solo = packerRoster.slice(0, 1);
  const payouts = evaluateShiftIncentiveRules(
    [packerRule({ rewardType: "PER_BLOCK_OF_METRIC", rewardValue: 1 })],
    { off_premise_sales: 199 },
    solo
  );
  assert.equal(payouts.length, 1);
  assert.equal(payouts[0].amount, 1);
});

test("packer bonus: shares sum EXACTLY to the pool when cents don't divide", () => {
  // $10.00 pool across 3 packers: 3.34 + 3.33 + 3.33, never 3.33*3=9.99.
  const threePackers: IncentiveRosterEntry[] = [
    { employeeId: 5, positionId: 20, category: "FOH" },
    { employeeId: 9, positionId: 20, category: "FOH" },
    { employeeId: 12, positionId: 20, category: "FOH" },
  ];
  const payouts = evaluateShiftIncentiveRules(
    [packerRule({ rewardValue: 0.01 })],
    { off_premise_sales: 1000 },
    threePackers
  );
  const total = Math.round(payouts.reduce((a, p) => a + p.amount, 0) * 100);
  assert.equal(total, 1000); // $10.00 in cents
  assert.deepEqual(payouts.map((p) => p.amount).sort((a, b) => b - a), [3.34, 3.33, 3.33]);
});

test("packer bonus: no packer on the roster -> nothing fires, no orphan pool", () => {
  const noPackers = packerRoster.filter((r) => r.positionId !== 20);
  const payouts = evaluateShiftIncentiveRules([packerRule()], { off_premise_sales: 3000 }, noPackers);
  assert.equal(payouts.length, 0);
});

test("packer bonus: zero off-premise sales -> skipped", () => {
  const payouts = evaluateShiftIncentiveRules([packerRule()], { off_premise_sales: 0 }, packerRoster);
  assert.equal(payouts.length, 0);
});

test("packer bonus: rewardCap ceilings the pool", () => {
  const solo = packerRoster.slice(0, 1);
  const payouts = evaluateShiftIncentiveRules(
    [packerRule({ rewardCap: 25 })],
    { off_premise_sales: 5000 }, // 1% = $50, capped to $25
    solo
  );
  assert.equal(payouts[0].amount, 25);
});

test("packer bonus: metric missing entirely -> condition fails, skipped", () => {
  const payouts = evaluateShiftIncentiveRules([packerRule()], { total_sales: 9000 }, packerRoster);
  assert.equal(payouts.length, 0);
});
