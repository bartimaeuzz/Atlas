import Link from "next/link";
import { loadPnL } from "@/lib/analytics/loadPnL";
import { BreakdownBarChart } from "./BreakdownBarChart";
import { KpiMeterCard } from "./KpiMeterCard";

/** Pinned to UTC noon, same fix as Reports/MyEarningsView — avoids the
 * classic "YYYY-MM-DD parses as the previous day" bug in negative-UTC-
 * offset timezones. Duplicated locally rather than centralized, same
 * as Reports/MyEarningsView already do -- no shared preset utility
 * exists yet in this codebase for this exact "this week/month/year"
 * shape. */
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function mostRecentMonday(d: Date): Date {
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffToMonday);
  return monday;
}
function computePresets(today: Date) {
  const monday = mostRecentMonday(today);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 12));
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1, 12));
  const yearEnd = new Date(Date.UTC(today.getUTCFullYear(), 11, 31, 12));
  return {
    week: { from: toIso(monday), to: toIso(sunday) },
    month: { from: toIso(monthStart), to: toIso(monthEnd) },
    year: { from: toIso(yearStart), to: toIso(yearEnd) },
  };
}

function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Analytics / P&L (2026-08-16) — Oliver's ask, modeled on his reference
 * workbook's "Chart" + "Report" sheets: revenue by channel, expenses by
 * category, and a P&L statement, computed purely from data already
 * inside Atlas (no Toast/POS API yet — that's a confirmed future step).
 * A new TOP-LEVEL page (Oliver's choice, not a Reports tab), manager-
 * only like every other financial page in this app.
 *
 * Phase 1 of a phased build, confirmed with Oliver before writing any
 * code: a single-period snapshot first (this page), with month-to-date/
 * year-to-date and period-over-period trend charts ("like stock
 * charts") as a deliberately separate follow-up round — see
 * project_atlas_analytics_pnl.md for the full design record.
 *
 * Revenue/expense/payroll figures come from lib/analytics/loadPnL.ts,
 * which itself composes loadRevenueBreakdown (reshapes the existing
 * Sales & Tax report), loadExpenseBreakdown (new: the first cross-
 * channel-by-category rollup across Petty Cash/Supplier Check/Card),
 * and loadPayrollCost (new: sums Atlas's own computed shift-wage data —
 * confirmed with Oliver as the P&L's payroll source of truth, NOT the
 * legacy PAYROLL BOH/PAYROLL FOH ledger categories, to avoid double-
 * counting).
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = parseDate(toIso(new Date()));
  const presets = computePresets(today);

  const from = params.from || presets.month.from;
  const to = params.to || presets.month.to;

  const pnl = await loadPnL(from, to);

  const revenueSlices = pnl.revenue.channels.map((c) => ({ label: c.channel, amount: c.amount, share: c.share }));
  const expenseSlices = pnl.expenses.categories.map((c) => ({
    label: `${c.categoryName}`,
    amount: c.amount,
    share: c.share,
  }));

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href="/" className="text-sm text-neutral-500 hover:text-black">
        &larr; Home
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Analytics &amp; P&amp;L</h1>
      <p className="text-neutral-500 text-sm mb-4">
        Revenue, expenses, and the &ldquo;sweet spot&rdquo; indicators for the range below — computed from
        finalized shifts and Ledger entries already in Atlas. No POS integration yet, so this
        only reflects what&apos;s been entered here.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-6 border rounded p-4 bg-neutral-50">
        <div className="flex gap-2">
          <PresetLink href={`/analytics?from=${presets.week.from}&to=${presets.week.to}`}>This week</PresetLink>
          <PresetLink href={`/analytics?from=${presets.month.from}&to=${presets.month.to}`}>This month</PresetLink>
          <PresetLink href={`/analytics?from=${presets.year.from}&to=${presets.year.to}`}>This year</PresetLink>
        </div>
        <form className="flex items-end gap-2 text-sm" action="/analytics">
          <label>
            <span className="block text-neutral-500 mb-1">From</span>
            <input type="date" name="from" defaultValue={from} className="border rounded px-2 py-1" />
          </label>
          <label>
            <span className="block text-neutral-500 mb-1">To</span>
            <input type="date" name="to" defaultValue={to} className="border rounded px-2 py-1" />
          </label>
          <button type="submit" className="px-3 py-1.5 rounded bg-black text-white text-sm">
            View
          </button>
        </form>
      </div>

      {/* Benchmarked KPIs -- the "sweet spot" indicators Oliver asked for */}
      <h2 className="text-sm font-medium mb-2">Health indicators</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <KpiMeterCard benchmark={pnl.kpis.foodCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.barCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.laborCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.primeCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.netMarginPct} />
      </div>

      {/* Revenue / expense breakdown charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <BreakdownBarChart
          title="Revenue by channel"
          subtitle="Net sales (excludes tax and tips) — Toast is your in-house register/card terminal."
          slices={revenueSlices}
          total={pnl.revenue.total}
        />
        <BreakdownBarChart
          title="Expenses by category"
          subtitle="Petty Cash + Supplier Check + Card, pooled by category. Payroll isn't shown here — see the P&L below, it's computed from actual shift wages instead."
          slices={expenseSlices}
          total={pnl.expenses.total}
        />
      </div>
      {pnl.expenses.excludedTotal > 0 && (
        <p className="text-xs text-neutral-400 -mt-6 mb-8">
          Note: ${money(pnl.expenses.excludedTotal)} logged under the PAYROLL BOH/PAYROLL FOH ledger categories was
          left out of the chart above — Payroll on this page comes from Atlas&apos;s own computed shift-wage data instead,
          so counting both would double-count. Re-tag those categories from{" "}
          <Link href="/ledger/categories" className="underline hover:text-black">
            Expense categories
          </Link>{" "}
          if that&apos;s not what you want.
        </p>
      )}

      {/* P&L statement */}
      <h2 className="text-sm font-medium mb-2">P&amp;L statement</h2>
      <table className="w-full text-sm border-collapse mb-2">
        <tbody>
          <PnLRow label="Revenue" amount={pnl.revenue.total} bold />
          <PnLRow label="Food cost" amount={-pnl.cogs.food} indent />
          <PnLRow label="Drinks cost (non-alcoholic)" amount={-pnl.cogs.drinks} indent />
          <PnLRow label="Bar cost (alcohol)" amount={-pnl.cogs.bar} indent />
          <PnLRow label="Cost of goods sold" amount={-pnl.cogs.total} bold border />
          <PnLRow label="Gross profit" amount={pnl.grossProfit} bold border />
          <PnLRow label="Payroll — FOH" amount={-pnl.payroll.foh} indent />
          <PnLRow label="Payroll — BOH" amount={-pnl.payroll.boh} indent />
          <PnLRow label="Payroll total" amount={-pnl.payroll.total} bold />
          <PnLRow label="Other operating expenses" amount={-pnl.otherOpex} bold />
          <PnLRow label="Net profit" amount={pnl.netProfit} bold border highlight />
        </tbody>
      </table>
      <p className="text-xs text-neutral-400 mb-8">
        Only counts finalized shifts and Supplier Check payments already printed/paid — matches the same rules the
        Sales &amp; Tax and Supplier Check reports already use.
      </p>
    </main>
  );
}

function PresetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded border text-sm text-neutral-600 hover:bg-white">
      {children}
    </Link>
  );
}

function PnLRow({
  label,
  amount,
  bold = false,
  indent = false,
  border = false,
  highlight = false,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  indent?: boolean;
  border?: boolean;
  highlight?: boolean;
}) {
  const isNegative = amount < 0;
  return (
    <tr className={border ? "border-t-2 border-neutral-800" : "border-b border-neutral-100"}>
      <td className={"py-1.5 " + (indent ? "pl-6 text-neutral-500" : "") + (bold ? " font-medium" : "")}>{label}</td>
      <td
        className={
          "py-1.5 text-right tabular-nums " +
          (bold ? "font-medium " : "") +
          (highlight ? "text-lg " : "") +
          (isNegative ? "text-neutral-500" : "")
        }
      >
        {isNegative ? "(" + money(Math.abs(amount)) + ")" : "$" + money(amount)}
      </td>
    </tr>
  );
}
