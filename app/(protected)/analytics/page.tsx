import Link from "next/link";
import { loadPnL } from "@/lib/analytics/loadPnL";
import { BreakdownBarChart } from "./BreakdownBarChart";
import { KpiMeterCard } from "./KpiMeterCard";
import { PageHeader, Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

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

/**
 * Analytics / P&L (2026-08-16) — Oliver's ask, modeled on his reference
 * workbook's "Chart" + "Report" sheets: revenue by channel, expenses by
 * category, and a P&L statement, computed purely from data already
 * inside Atlas (no Toast/POS API yet — that's a confirmed future step).
 * A new TOP-LEVEL page (Oliver's choice, not a Reports tab), manager-
 * only like every other financial page in this app -- enforced by the
 * shared `(protected)` layout's `requireManager()` guard, not a
 * per-page check, same as every sibling financial page.
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
 *
 * Design-system-v2 retrofit (2026-08-21) — the last page from the
 * original 5-page retrofit list still on raw Tailwind neutrals. Restyled
 * onto `components/ui` primitives and `--ink-*`/`--border`/`--danger-*`
 * tokens, matching the rest of the app. Two real bugs caught along the
 * way, not just visual restyling:
 *
 * 1. This page's local `money()` helper (and the two chart components'
 *    inline formatting) called `Number#toLocaleString(undefined, ...)` —
 *    an explicit `undefined` locale resolves against the runtime's
 *    default, which can differ between Node's server-render and the
 *    browser's client-render, the exact same hydration-mismatch
 *    mechanism as the `Date#toLocaleString()` bug fixed elsewhere this
 *    same day (see lib/formatDateTime.ts). Not yet reproduced live (this
 *    is a narrower trigger than the Date case -- it only differs when
 *    the browser's own locale setting isn't US-English), but the same
 *    bug class, so fixed proactively rather than waiting for a report.
 *    Replaced with Ledger's shared, `"en-US"`-pinned `formatMoney()`.
 * 2. The P&L table rendered negative amounts as `(1,234.56)` — parens,
 *    no `$`. Atlas's own documented money-format rule is a leading
 *    minus sign, not parens (`project_atlas_ui_design.md`). `formatMoney`
 *    fixes this as a side effect of the formatter swap above. Colored
 *    every negative row `--danger-700`, matching the precedent already
 *    shipped on Payroll's Deduction column and Ledger's reconciliation
 *    panel — most P&L rows are cost lines and therefore negative by
 *    construction, so this does mean most of the table reads red, but
 *    that's consistent with both this app's existing convention and the
 *    common "expenses in red" accounting-statement convention, rather
 *    than inventing a P&L-specific exception to the app's own rule.
 *
 * The two chart components' actual data-color logic (BreakdownBarChart's
 * `categoricalSlot()`, KpiMeterCard's `STATUS_COLORS`) is deliberately
 * left untouched -- it's a fixed, dataviz-skill-validated palette, not
 * part of the design-system token set, and re-validating it wasn't in
 * scope for this pass. Only the surrounding chrome (card background/
 * border/radius, text colors) was retrofit.
 *
 * 3. Live mobile re-verification (390px) after the above shipped caught a
 *    third bug: the P&L table had a `min-w-[420px]` forcing a
 *    horizontal-scroll table on phone, cutting the amount column off-
 *    screen for every indented row -- the exact anti-pattern Payroll's
 *    own doc comment calls out (that page uses a stacked-cards-on-phone
 *    split specifically to avoid it). Unlike Payroll's multi-field rows,
 *    a P&L line is just a label/amount pair, so a full stacked-card
 *    split isn't needed -- removing the forced min-width and adding real
 *    cell padding (px-3/pl-8) lets the two-column table lay out fluidly
 *    and fit 390px without scrolling or clipping. Re-verified live: no
 *    horizontal scroll needed, every row's amount visible, at 390x844.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Permission System Phase C (2026-08-21) -- two capabilities, one page.
  // VIEW_ANALYTICS opens the page (operating ratios and the revenue /
  // expense breakdowns); VIEW_PNL additionally reveals the bottom-line
  // profit figures. Oliver's call, confirmed before building: a manager
  // can be shown where the money is going without being shown what the
  // restaurant earns.
  //
  // "Bottom-line profit" is deliberately read as more than just the P&L
  // table -- confirmed with Oliver after a scrutinize pass showed a
  // narrower reading would have been cosmetic. Three things are withheld
  // without VIEW_PNL:
  //   1. the P&L statement itself;
  //   2. the Net margin health indicator, which IS a profit figure (net
  //      profit as a % of revenue);
  //   3. every dollar amount on the two breakdown charts, because total
  //      revenue times the prime-cost ratio (which stays) reconstructs
  //      the bottom line to within other operating expenses.
  // Food/bar/labor/prime cost ratios and the breakdown SHARES stay --
  // "food is 31% of spend, up from 27%" is the cost-control job
  // VIEW_ANALYTICS exists for, and needs no dollar figures.
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_ANALYTICS")) return <NoAccess pageLabel="the Analytics page" />;
  const canSeePnL = viewer.has("VIEW_PNL");

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
    <main className="max-w-5xl mx-auto p-4 sm:p-8">
      <PageHeader
        title={canSeePnL ? "Analytics & P&L" : "Analytics"}
        description={
          canSeePnL
            ? `Revenue, expenses, and the "sweet spot" indicators for the range below — computed from finalized shifts and Ledger entries already in Atlas. No POS integration yet, so this only reflects what's been entered here.`
            : `Where revenue and spending are going for the range below, as shares of the total, plus the "sweet spot" cost indicators — computed from finalized shifts and Ledger entries already in Atlas. Dollar totals are part of the P&L, which isn't turned on for your account.`
        }
      />

      <Card className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex gap-2">
          <LinkButton href={`/analytics?from=${presets.week.from}&to=${presets.week.to}`} variant="secondary" size="sm">
            This week
          </LinkButton>
          <LinkButton href={`/analytics?from=${presets.month.from}&to=${presets.month.to}`} variant="secondary" size="sm">
            This month
          </LinkButton>
          <LinkButton href={`/analytics?from=${presets.year.from}&to=${presets.year.to}`} variant="secondary" size="sm">
            This year
          </LinkButton>
        </div>
        {/* 2026-08-21 visual-audit fix: this row was `flex items-end gap-2`
            with no wrap, so at 390px its two date inputs plus the View
            button measured 399px inside a ~342px content column -- the
            View button rendered entirely off-screen (x=432 in a 390px
            viewport) and the whole page scrolled sideways, a WCAG 1.4.10
            Reflow failure on the filter's only submit control. Same
            anti-pattern class as the P&L table's min-width bug fixed
            earlier the same day, different component on the same page.
            Now wraps, and the inputs flex down instead of holding an
            intrinsic width. */}
        <form className="flex flex-wrap items-end gap-2 w-full sm:w-auto" action="/analytics">
          <div className="flex-1 min-w-[9.5rem]">
            <TextInput type="date" name="from" label="From" defaultValue={from} className="min-h-9 py-1.5" />
          </div>
          <div className="flex-1 min-w-[9.5rem]">
            <TextInput type="date" name="to" label="To" defaultValue={to} className="min-h-9 py-1.5" />
          </div>
          <Button type="submit" size="sm">
            View
          </Button>
        </form>
      </Card>

      {/* Benchmarked KPIs -- the "sweet spot" indicators Oliver asked for */}
      <h2 className="text-[15px] font-semibold text-[var(--ink-900)] mb-3">Health indicators</h2>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 ${canSeePnL ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <KpiMeterCard benchmark={pnl.kpis.foodCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.barCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.laborCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.primeCostPct} />
        {canSeePnL && <KpiMeterCard benchmark={pnl.kpis.netMarginPct} />}
      </div>

      {/* Revenue / expense breakdown charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <BreakdownBarChart
          title="Revenue by channel"
          subtitle={
            canSeePnL
              ? "Net sales (excludes tax and tips) — Toast is your in-house register/card terminal."
              : "Share of net sales by channel — Toast is your in-house register/card terminal."
          }
          slices={revenueSlices}
          total={pnl.revenue.total}
          showAmounts={canSeePnL}
        />
        <BreakdownBarChart
          title="Expenses by category"
          subtitle={
            canSeePnL
              ? "Petty Cash + Supplier Check + Card, pooled by category. Payroll isn't shown here — see the P&L below, it's computed from actual shift wages instead."
              : "Share of spend by category, pooled from Petty Cash + Supplier Check + Card. Payroll isn't included here — it's computed from actual shift wages instead."
          }
          slices={expenseSlices}
          total={pnl.expenses.total}
          showAmounts={canSeePnL}
        />
      </div>
      {pnl.expenses.excludedTotal > 0 && (
        <p className="text-xs text-[var(--ink-500)] -mt-6 mb-8">
          {/* The amount itself is a dollar figure, so it follows the same
              rule as the charts above -- the note still explains what was
              excluded and why, just without the number. */}
          Note: spending logged under the PAYROLL BOH/PAYROLL FOH ledger categories
          {canSeePnL ? ` (${formatMoney(pnl.expenses.excludedTotal)})` : ""} was
          left out of the chart above — Payroll on this page comes from Atlas&apos;s own computed shift-wage data instead,
          so counting both would double-count. Re-tag those categories from{" "}
          <Link href="/ledger/categories" className="underline hover:text-[var(--ink-900)]">
            Expense categories
          </Link>{" "}
          if that&apos;s not what you want.
        </p>
      )}

      {/* P&L statement -- VIEW_PNL only, see the doc block at the top of
          this component for why this is a separate capability. */}
      {canSeePnL && (
        <>
          <h2 className="text-[15px] font-semibold text-[var(--ink-900)] mb-3">P&amp;L statement</h2>
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-x-auto mb-2">
            <table className="w-full text-sm border-collapse">
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
          </div>
          <p className="text-xs text-[var(--ink-500)] mb-8">
            Only counts finalized shifts and Supplier Check payments already printed/paid — matches the same rules the
            Sales &amp; Tax and Supplier Check reports already use.
          </p>
        </>
      )}
    </main>
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
  // 2026-08-21 retrofit: negatives now go through the shared formatMoney
  // (leading minus sign, not parens) and render in --danger-700, matching
  // Payroll's Deduction column / Ledger's reconciliation panel -- see the
  // page-level doc comment above for why this applies to every negative
  // row here, not just anomaly/mismatch signals.
  const isNegative = amount < 0;
  const amountColor = isNegative ? "text-[var(--danger-700)]" : bold ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]";
  return (
    <tr
      className={
        // A heavier, near-black rule for subtotal/total rows -- intentionally
        // stronger than the app's usual --border-strong divider, matching
        // standard accounting-statement styling for a subtotal line.
        border ? "border-t-2 border-[var(--ink-900)]" : "border-b border-[var(--border)]"
      }
    >
      <td className={`py-2 pr-2 ${indent ? "pl-8 text-[var(--ink-500)]" : "pl-3 text-[var(--ink-900)]"} ${bold ? "font-semibold" : ""}`}>
        {label}
      </td>
      <td
        className={
          "py-2 pr-3 text-right tabular-nums " +
          (bold ? "font-semibold " : "") +
          (highlight ? "text-lg " : "") +
          amountColor
        }
      >
        {formatMoney(amount)}
      </td>
    </tr>
  );
}
