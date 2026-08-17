import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregatePayrollRows, type PayrollPayoutRow } from "../loadPayrollRegister";

function row(overrides: Partial<PayrollPayoutRow>): PayrollPayoutRow {
  return {
    employeeId: 1,
    employeeName: "Aey",
    flatWageAmount: 0,
    extraPayAmount: 0,
    incentiveAmount: 0,
    deductionAmount: 0,
    tipPoolShare: 0,
    hostUpsellTipShare: null,
    totalTip: 0,
    totalCorePayout: 0,
    ...overrides,
  };
}

test("single shift for one employee passes through unchanged (just rounded)", () => {
  const rows = aggregatePayrollRows([
    row({
      employeeId: 1,
      employeeName: "Aey",
      flatWageAmount: 120,
      tipPoolShare: 85.333333,
      totalTip: 85.333333,
      totalCorePayout: 205.333333,
    }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.shiftCount, 1);
  assert.equal(rows[0]?.tipPoolShare, 85.33);
  assert.equal(rows[0]?.totalCorePayout, 205.33);
});

test("multiple shifts for the same employee across the week are summed, not overwritten", () => {
  const rows = aggregatePayrollRows([
    row({ employeeId: 1, employeeName: "Aey", flatWageAmount: 100, totalCorePayout: 150 }),
    row({ employeeId: 1, employeeName: "Aey", flatWageAmount: 110, totalCorePayout: 160 }),
    row({ employeeId: 1, employeeName: "Aey", flatWageAmount: 90, totalCorePayout: 140 }),
  ]);
  assert.equal(rows.length, 1, "three shift-rows for one employee must collapse into one register row");
  assert.equal(rows[0]?.shiftCount, 3);
  assert.equal(rows[0]?.flatWageAmount, 300);
  assert.equal(rows[0]?.totalCorePayout, 450);
});

test("different employees stay on separate rows", () => {
  const rows = aggregatePayrollRows([
    row({ employeeId: 1, employeeName: "Aey", totalCorePayout: 200 }),
    row({ employeeId: 2, employeeName: "Bomb", totalCorePayout: 300 }),
  ]);
  assert.equal(rows.length, 2);
});

test("null hostUpsellTipShare (most shifts, since it's a rare bonus) defaults to 0, doesn't throw or become NaN", () => {
  const rows = aggregatePayrollRows([
    row({ employeeId: 1, employeeName: "Aey", hostUpsellTipShare: null, totalCorePayout: 100 }),
    row({ employeeId: 1, employeeName: "Aey", hostUpsellTipShare: 12.5, totalCorePayout: 100 }),
  ]);
  assert.equal(rows[0]?.hostUpsellTipShare, 12.5);
});

test("rows are sorted alphabetically by employee name regardless of input order", () => {
  const rows = aggregatePayrollRows([
    row({ employeeId: 3, employeeName: "Wiinchy" }),
    row({ employeeId: 1, employeeName: "Aey" }),
    row({ employeeId: 2, employeeName: "Meji" }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.employeeName),
    ["Aey", "Meji", "Wiinchy"]
  );
});

test("every money field is independently rounded to the cent, not just the total", () => {
  const rows = aggregatePayrollRows([
    row({
      employeeId: 1,
      employeeName: "Aey",
      flatWageAmount: 33.333333,
      extraPayAmount: 10.006,
      incentiveAmount: 5.005,
      deductionAmount: 1.001,
      tipPoolShare: 20.995,
      totalTip: 20.995,
      totalCorePayout: 68.333,
    }),
  ]);
  const r = rows[0]!;
  assert.equal(r.flatWageAmount, 33.33);
  assert.equal(r.extraPayAmount, 10.01);
  assert.equal(r.incentiveAmount, 5.01);
  assert.equal(r.deductionAmount, 1.0);
  assert.equal(r.tipPoolShare, 21.0);
});

test("empty week (no finalized shifts) returns an empty register, not an error", () => {
  const rows = aggregatePayrollRows([]);
  assert.deepEqual(rows, []);
});
