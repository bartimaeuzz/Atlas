import { test } from "node:test";
import assert from "node:assert/strict";
import { computePnL } from "../loadPnL";
import type { RevenueBreakdown } from "../loadRevenueBreakdown";
import type { ExpenseBreakdown, ExpenseCategorySlice } from "../loadExpenseBreakdown";
import type { PayrollCostBreakdown } from "../loadPayrollCost";

function revenue(total: number): RevenueBreakdown {
  return { dateFrom: "2026-08-01", dateTo: "2026-08-07", total, channels: [{ channel: "Toast (in-house)", amount: total, share: 1 }] };
}

function expenses(categories: Pick<ExpenseCategorySlice, "pnlGroup" | "amount">[]): ExpenseBreakdown {
  const total = categories.filter((c) => c.pnlGroup !== "EXCLUDED").reduce((s, c) => s + c.amount, 0);
  return {
    dateFrom: "2026-08-01",
    dateTo: "2026-08-07",
    total,
    excludedTotal: 0,
    categories: categories.map((c, i) => ({ categoryId: i, categoryName: c.pnlGroup, share: 0, ...c })),
  };
}

function payroll(total: number, foh = total, boh = 0): PayrollCostBreakdown {
  return { dateFrom: "2026-08-01", dateTo: "2026-08-07", total, foh, boh };
}

test("gross profit = revenue - COGS (food + drinks + bar), net profit further subtracts payroll and other opex", () => {
  const result = computePnL(
    "2026-08-01",
    "2026-08-07",
    revenue(10000),
    expenses([
      { pnlGroup: "FOOD", amount: 2500 },
      { pnlGroup: "BEVERAGE_NONALC", amount: 300 },
      { pnlGroup: "BEVERAGE_ALC", amount: 500 },
      { pnlGroup: "OTHER_EXPENSE", amount: 800 },
    ]),
    payroll(3200)
  );
  assert.equal(result.cogs.total, 3300); // 2500 + 300 + 500
  assert.equal(result.grossProfit, 6700); // 10000 - 3300
  assert.equal(result.netProfit, 2700); // 6700 - 3200 payroll - 800 other opex
});

test("food cost % combines FOOD and BEVERAGE_NONALC but not BEVERAGE_ALC (bar is tracked separately per Aey's request)", () => {
  const result = computePnL(
    "2026-08-01",
    "2026-08-07",
    revenue(10000),
    expenses([
      { pnlGroup: "FOOD", amount: 3000 },
      { pnlGroup: "BEVERAGE_NONALC", amount: 200 },
      { pnlGroup: "BEVERAGE_ALC", amount: 1000 }, // must NOT count toward food cost %
    ]),
    payroll(0)
  );
  assert.equal(result.kpis.foodCostPct.value, 0.32); // (3000 + 200) / 10000, not 4200/10000
});

test("KPI status classification: below, in, and above the researched benchmark band", () => {
  const below = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 2000 }]), payroll(0));
  assert.equal(below.kpis.foodCostPct.status, "below_range"); // 20% < 28% low

  const inRange = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 3200 }]), payroll(0));
  assert.equal(inRange.kpis.foodCostPct.status, "in_range"); // 32%, between 28-35%

  const above = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 4500 }]), payroll(0));
  assert.equal(above.kpis.foodCostPct.status, "above_range"); // 45% > 35% high
});

test("bar cost % is deliberately unbenchmarked (not_applicable) even when the value is computed", () => {
  const result = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "BEVERAGE_ALC", amount: 800 }]), payroll(0));
  assert.equal(result.kpis.barCostPct.value, 0.08);
  assert.equal(result.kpis.barCostPct.status, "not_applicable");
  assert.equal(result.kpis.barCostPct.goodRangeLow, null);
});

test("zero revenue doesn't throw or divide by zero -- every ratio is defined as 0, not NaN or Infinity", () => {
  const result = computePnL("2026-08-01", "2026-08-07", revenue(0), expenses([{ pnlGroup: "FOOD", amount: 500 }]), payroll(200));
  assert.equal(result.kpis.foodCostPct.value, 0);
  assert.equal(result.kpis.laborCostPct.value, 0);
  assert.equal(result.kpis.primeCostPct.value, 0);
  assert.equal(result.kpis.netMarginPct.value, 0);
  assert.equal(Number.isFinite(result.kpis.foodCostPct.value), true);
});

test("labor cost % uses computed payroll (wage/extra/incentive minus deductions), not the legacy PAYROLL ledger categories", () => {
  const result = computePnL(
    "2026-08-01",
    "2026-08-07",
    revenue(10000),
    expenses([{ pnlGroup: "EXCLUDED", amount: 9999 }]), // a legacy payroll ledger entry -- must be ignored entirely
    payroll(3000)
  );
  assert.equal(result.kpis.laborCostPct.value, 0.3); // 3000/10000, unaffected by the excluded category
  assert.equal(result.cogs.total, 0); // EXCLUDED must not leak into COGS either
});

test("prime cost % is COGS + labor combined over revenue, the single most-watched number", () => {
  const result = computePnL(
    "2026-08-01",
    "2026-08-07",
    revenue(10000),
    expenses([
      { pnlGroup: "FOOD", amount: 3000 },
      { pnlGroup: "BEVERAGE_ALC", amount: 500 },
    ]),
    payroll(3000)
  );
  assert.equal(result.kpis.primeCostPct.value, 0.65); // (3000 + 500 + 3000) / 10000
});
