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

/* ---- "% of sales" pass (2026-08-30, Aey's ask) ---- */

test("shareOfRevenue gives every P&L line its share of revenue, with cost lines POSITIVE", () => {
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
    payroll(3200, 2000, 1200)
  );
  // Costs are rendered as negative AMOUNTS in the table but must carry a
  // positive SHARE -- "Food cost -$2,500 / 25.0%", never "-25.0%".
  assert.equal(result.shareOfRevenue.food, 0.25);
  assert.equal(result.shareOfRevenue.drinks, 0.03);
  assert.equal(result.shareOfRevenue.bar, 0.05);
  assert.equal(result.shareOfRevenue.cogs, 0.33);
  assert.equal(result.shareOfRevenue.payrollFoh, 0.2);
  assert.equal(result.shareOfRevenue.payrollBoh, 0.12);
  assert.equal(result.shareOfRevenue.payrollTotal, 0.32);
  assert.equal(result.shareOfRevenue.otherOpex, 0.08);
  assert.equal(result.shareOfRevenue.revenue, 1);
  assert.equal(result.shareOfRevenue.grossProfit, 0.67);
  assert.equal(result.shareOfRevenue.netProfit, 0.27);
});

test("total cost sums COGS + payroll + other opex, and its share plus net profit's share is always 1", () => {
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
  assert.equal(result.totalCost, 7300); // 3300 COGS + 3200 payroll + 800 other
  assert.equal(result.shareOfRevenue.totalCost, 0.73);
  // The identity the UI copy claims out loud, and the reason Total cost %
  // is gated behind VIEW_PNL alongside Net margin %.
  assert.equal(
    (result.shareOfRevenue.totalCost ?? 0) + (result.shareOfRevenue.netProfit ?? 0),
    1
  );
  assert.equal(result.kpis.totalCostPct.value + result.kpis.netMarginPct.value, 1);
});

test("total cost % classifies against the 92-97% band (the complement of the 3-8% net-margin range)", () => {
  const lean = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 5000 }]), payroll(3000));
  assert.equal(lean.kpis.totalCostPct.value, 0.8); // 80% cost, 20% margin
  assert.equal(lean.kpis.totalCostPct.status, "below_range");

  const healthy = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 5500 }]), payroll(4000));
  assert.equal(healthy.kpis.totalCostPct.status, "in_range"); // 95%

  const bleeding = computePnL("2026-08-01", "2026-08-07", revenue(10000), expenses([{ pnlGroup: "FOOD", amount: 6000 }]), payroll(4500));
  assert.equal(bleeding.kpis.totalCostPct.status, "above_range"); // 105%
  assert.equal(bleeding.kpis.totalCostPct.concernDirection, "above");
});

test("a real loss keeps a NEGATIVE share on the profit lines -- only costs are forced positive", () => {
  const result = computePnL(
    "2026-08-01",
    "2026-08-07",
    revenue(10000),
    expenses([{ pnlGroup: "FOOD", amount: 12000 }]), // COGS alone exceeds revenue
    payroll(1000)
  );
  assert.equal(result.shareOfRevenue.food, 1.2); // the cost itself stays positive
  assert.equal(result.shareOfRevenue.grossProfit, -0.2); // but the loss reads as a loss
  assert.equal(result.shareOfRevenue.netProfit, -0.3);
});

test("zero revenue makes every share NULL, not 0 -- the column must say 'nothing to compare against'", () => {
  const result = computePnL("2026-08-01", "2026-08-07", revenue(0), expenses([{ pnlGroup: "FOOD", amount: 500 }]), payroll(200));
  // 0.0% next to a real $500 food cost would be a false statement; the UI
  // renders null as an em dash instead.
  assert.equal(result.shareOfRevenue.food, null);
  assert.equal(result.shareOfRevenue.revenue, null);
  assert.equal(result.shareOfRevenue.totalCost, null);
  assert.equal(result.shareOfRevenue.netProfit, null);
  // The KPI meters still need a finite number to draw a bar.
  assert.equal(result.kpis.totalCostPct.value, 0);
  assert.equal(Number.isFinite(result.kpis.totalCostPct.value), true);
});
