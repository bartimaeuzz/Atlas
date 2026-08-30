/**
 * Combined P&L view for the Analytics page (2026-08-16) -- ties together
 * loadRevenueBreakdown/loadExpenseBreakdown/loadPayrollCost into one
 * Revenue -> COGS -> Gross profit -> Payroll -> Other opex -> Net profit
 * statement, plus the "sweet spot" benchmarked KPI ratios Oliver asked
 * for (food cost %, labor cost %, prime cost %, net margin %).
 *
 * Benchmark ranges are real industry figures researched before building
 * this (sources noted per KPI below), not invented -- and only applied
 * where research actually supports a number. Bar/alcohol cost is shown
 * as its own line (per Aey's request to keep Food/Drinks/Bar separate)
 * but WITHOUT a benchmark band, since liquor-cost-specific industry
 * ranges weren't part of the research done for this round -- better to
 * show no band than a fabricated one. Same restraint applies everywhere
 * else in this file: every `goodRangeLow`/`goodRangeHigh` traces back to
 * a cited source.
 *
 * "% of sales" pass (2026-08-30, Aey's ask: "ต้นทุนเป็นกี่เปอร์เซ็นต์ของ
 * ยอดขาย"). Two additions, both computed here rather than in the page so
 * they are unit-testable like the rest of the money math:
 *
 *   1. `shareOfRevenue` — every P&L line as a share of revenue, so the
 *      statement can render the standard common-size third column. Costs
 *      carry the sign of the underlying COST (positive), NOT of the
 *      negated display amount: the table shows "Food cost  -$2,500  25.0%",
 *      because "-25.0%" would read to a non-accountant as negative-25-
 *      percent rather than "a quarter of sales". Gross/net profit keep a
 *      real sign, so an actual loss still shows as a negative share.
 *      `null` (not 0) when revenue is 0 — "no sales to compare against"
 *      renders as an em dash, whereas 0.0% would be a claim.
 *
 *   2. `totalCostPct` — the whole cost side as one benchmarked KPI. Its
 *      band is NOT new research: totalCost/revenue is exactly
 *      1 − netMargin, so the 92-97% band is the arithmetic complement of
 *      the already-cited 3-8% net-margin range, and the same source is
 *      carried through. Because of that identity it is a bottom-line
 *      figure and is gated behind VIEW_PNL alongside `netMarginPct` —
 *      see the capability note in app/(protected)/analytics/page.tsx.
 */
import { loadRevenueBreakdown, type RevenueBreakdown } from "@/lib/analytics/loadRevenueBreakdown";
import { loadExpenseBreakdown, sumByPnlGroup, type ExpenseBreakdown } from "@/lib/analytics/loadExpenseBreakdown";
import { loadPayrollCost, type PayrollCostBreakdown } from "@/lib/analytics/loadPayrollCost";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export type BenchmarkStatus = "below_range" | "in_range" | "above_range" | "not_applicable";

export interface Benchmark {
  label: string;
  /** 0-1 ratio (e.g. 0.32 = 32%). */
  value: number;
  /** 0-1 ratio, or null if this metric has no researched benchmark band. */
  goodRangeLow: number | null;
  goodRangeHigh: number | null;
  status: BenchmarkStatus;
  /** Short, source-grounded explanation of what the range means and
   * which direction is a concern -- shown in the UI, not just internal
   * documentation, since "below range" doesn't mean the same thing for
   * every metric (e.g. low prime cost can mean understaffed, not good). */
  note: string;
  source: string;
  /** Which side of the healthy band is the genuine problem, so the UI
   * can reserve its warning styling for that side only. Added
   * 2026-08-21 after a visual audit found every out-of-band value --
   * including ones this file's own `note` text calls fine ("Above 8% is
   * great, not a warning sign") -- rendering with an amber warning
   * glyph. `null` for metrics with no benchmark band. */
  concernDirection: "above" | "below" | null;
}

export interface PnLData {
  dateFrom: string;
  dateTo: string;
  revenue: RevenueBreakdown;
  expenses: ExpenseBreakdown;
  payroll: PayrollCostBreakdown;
  cogs: { food: number; drinks: number; bar: number; total: number };
  otherOpex: number;
  grossProfit: number;
  netProfit: number;
  /** COGS + payroll + other opex — the whole cost side of the statement. */
  totalCost: number;
  /** Each P&L line as a 0-1 share of revenue, for the statement's
   * "% of sales" column. `null` means there is no revenue in the range to
   * compare against, which the UI must render as "—" rather than 0.0%. */
  shareOfRevenue: {
    revenue: number | null;
    food: number | null;
    drinks: number | null;
    bar: number | null;
    cogs: number | null;
    grossProfit: number | null;
    payrollFoh: number | null;
    payrollBoh: number | null;
    payrollTotal: number | null;
    otherOpex: number | null;
    totalCost: number | null;
    netProfit: number | null;
  };
  kpis: {
    foodCostPct: Benchmark;
    laborCostPct: Benchmark;
    primeCostPct: Benchmark;
    netMarginPct: Benchmark;
    barCostPct: Benchmark;
    totalCostPct: Benchmark;
  };
}

function statusFor(value: number, low: number | null, high: number | null): BenchmarkStatus {
  if (low == null || high == null) return "not_applicable";
  if (value < low) return "below_range";
  if (value > high) return "above_range";
  return "in_range";
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Same ratio as `pct`, but returns `null` instead of 0 when there is no
 * revenue to divide by. The KPI meters need a finite number to draw a bar
 * and 0 is the honest reading there; the statement's "% of sales" column
 * needs to say "nothing to compare against", and printing "0.0%" next to a
 * real $2,500 food cost would be an outright false statement. */
function share(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export async function loadPnL(dateFrom: string, dateTo: string): Promise<PnLData> {
  const [revenue, expenses, payroll] = await Promise.all([
    loadRevenueBreakdown(dateFrom, dateTo),
    loadExpenseBreakdown(dateFrom, dateTo),
    loadPayrollCost(dateFrom, dateTo),
  ]);

  return computePnL(dateFrom, dateTo, revenue, expenses, payroll);
}

/** Pure composition step, split out from loadPnL (2026-08-17) specifically
 * so the P&L math -- COGS/gross/net profit, the 5 benchmarked KPI ratios
 * and their below/in/above-range classification -- is unit-testable the
 * same way lib/calc's tip-pool/wage math already is, without needing a
 * database. loadPnL itself stays a thin fetch-three-breakdowns-then-
 * delegate wrapper; this function is the actual money math. */
export function computePnL(
  dateFrom: string,
  dateTo: string,
  revenue: RevenueBreakdown,
  expenses: ExpenseBreakdown,
  payroll: PayrollCostBreakdown
): PnLData {
  const food = sumByPnlGroup(expenses, "FOOD");
  const drinks = sumByPnlGroup(expenses, "BEVERAGE_NONALC");
  const bar = sumByPnlGroup(expenses, "BEVERAGE_ALC");
  const cogsTotal = round2(food + drinks + bar);
  const otherOpex = sumByPnlGroup(expenses, "OTHER_EXPENSE");

  const grossProfit = round2(revenue.total - cogsTotal);
  const netProfit = round2(grossProfit - payroll.total - otherOpex);

  const foodCostValue = pct(food + drinks, revenue.total);
  const laborCostValue = pct(payroll.total, revenue.total);
  const primeCostValue = pct(cogsTotal + payroll.total, revenue.total);
  const netMarginValue = pct(netProfit, revenue.total);
  const barCostValue = pct(bar, revenue.total);
  const totalCost = round2(cogsTotal + payroll.total + otherOpex);
  const totalCostValue = pct(totalCost, revenue.total);

  const kpis: PnLData["kpis"] = {
    foodCostPct: {
      label: "Food cost %",
      concernDirection: "above",
      value: foodCostValue,
      goodRangeLow: 0.28,
      goodRangeHigh: 0.35,
      status: statusFor(foodCostValue, 0.28, 0.35),
      note:
        "Food + Drinks (non-alcoholic) as a share of revenue. 28-35% is the healthy range (industry average ~32%); consistently above 35% often points to pricing, waste, portioning, or inventory issues. Below 28% isn't automatically a problem.",
      source: "WhippleWood CPAs, Restaurant Financial Benchmarks 2026",
    },
    laborCostPct: {
      label: "Labor cost %",
      concernDirection: "above",
      value: laborCostValue,
      goodRangeLow: 0.25,
      goodRangeHigh: 0.36,
      status: statusFor(laborCostValue, 0.25, 0.36),
      note:
        "Computed payroll (wage + extra pay + incentives - deductions, no tips) as a share of revenue. Full-service median runs ~36.5%; the most profitable operators run closer to ~34%. Below 25% is unusually lean — worth checking you're not understaffed.",
      source: "WhippleWood CPAs, Restaurant Financial Benchmarks 2026",
    },
    primeCostPct: {
      label: "Prime cost %",
      concernDirection: "above",
      value: primeCostValue,
      goodRangeLow: 0.55,
      goodRangeHigh: 0.65,
      status: statusFor(primeCostValue, 0.55, 0.65),
      note:
        "Food + Drinks + Bar + Labor combined, as a share of revenue — the single most-watched restaurant health number. 55-65% is the target band: below 55% can mean unusually efficient (or understaffed); above 65% usually signals a structural problem menu tweaks alone won't fix.",
      source: "WhippleWood CPAs, Restaurant Financial Benchmarks 2026",
    },
    netMarginPct: {
      label: "Net margin %",
      concernDirection: "below",
      value: netMarginValue,
      goodRangeLow: 0.03,
      goodRangeHigh: 0.08,
      status: statusFor(netMarginValue, 0.03, 0.08),
      note:
        "What's left after COGS, payroll, and other operating expenses. 3-8% is typical for a full-service restaurant. Above 8% is great, not a warning sign.",
      source: "WhippleWood CPAs, Restaurant Financial Benchmarks 2026",
    },
    totalCostPct: {
      label: "Total cost %",
      concernDirection: "above",
      value: totalCostValue,
      goodRangeLow: 0.92,
      goodRangeHigh: 0.97,
      status: statusFor(totalCostValue, 0.92, 0.97),
      note:
        "Every dollar of cost — food, drinks, bar, payroll, and other operating expenses — as a share of revenue. It answers \"how much of each $1 of sales goes straight back out?\" 92-97% is the healthy band; above 97% leaves under 3 cents of every sales dollar. This is the mirror of Net margin % — the two split every sales dollar between cost and profit — so its band is the complement of that metric's researched 3-8% range rather than separate research.",
      source: "WhippleWood CPAs, Restaurant Financial Benchmarks 2026 (complement of the net-margin range)",
    },
    barCostPct: {
      label: "Bar cost %",
      concernDirection: null,
      value: barCostValue,
      goodRangeLow: null,
      goodRangeHigh: null,
      status: "not_applicable",
      note:
        "Alcohol/mocktail/bar-program cost as a share of revenue, tracked separately from Food cost per Aey's request — liquor typically runs a lower cost % than food (higher margin), but no benchmark band is shown here since that wasn't part of the research done for this round.",
      source: "Not benchmarked yet",
    },
  };

  return {
    dateFrom,
    dateTo,
    revenue,
    expenses,
    payroll,
    cogs: { food, drinks, bar, total: cogsTotal },
    otherOpex,
    grossProfit,
    netProfit,
    totalCost,
    shareOfRevenue: {
      // Revenue against itself is 1 by definition, but only when there IS
      // revenue -- `share` keeps that honest rather than hardcoding 1.
      revenue: share(revenue.total, revenue.total),
      food: share(food, revenue.total),
      drinks: share(drinks, revenue.total),
      bar: share(bar, revenue.total),
      cogs: share(cogsTotal, revenue.total),
      grossProfit: share(grossProfit, revenue.total),
      payrollFoh: share(payroll.foh, revenue.total),
      payrollBoh: share(payroll.boh, revenue.total),
      payrollTotal: share(payroll.total, revenue.total),
      otherOpex: share(otherOpex, revenue.total),
      totalCost: share(totalCost, revenue.total),
      netProfit: share(netProfit, revenue.total),
    },
    kpis,
  };
}
