import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadPnL } from "@/lib/analytics/loadPnL";
import { BreakdownBarChart } from "./BreakdownBarChart";
import { KpiMeterCard } from "./KpiMeterCard";
import { PageHeader, Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { formatShare } from "@/lib/analytics/formatShare";
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
 *
 * "% of sales" pass (2026-08-30) — Aey asked what percentage of sales the
 * costs are. Three changes, and note that (3) is a direct consequence of
 * (1), not an unrelated tidy-up:
 *
 *   1. The P&L statement gains a third "% of sales" column (the standard
 *      common-size layout) plus a Total cost row, so every line answers
 *      the question and not just the four the KPI cards already covered.
 *      Percentages come from `pnl.shareOfRevenue`, computed and unit-
 *      tested in loadPnL.ts, NOT derived from the row's display amount --
 *      cost rows show a negative amount and a positive share on purpose.
 *   2. A `Total cost %` KPI card. Gated behind VIEW_PNL, because it is
 *      algebraically 1 - net margin; see the capability block below.
 *   3. The table's first <thead>, and tighter sub-`sm` cell padding.
 *      Point (1) took the table from two columns to three in a ~308px
 *      phone content column, which crushed the label column to 110px and
 *      wrapped four labels to 3-4 lines. Measured at 308px and fixed by
 *      letting the header cells wrap and trimming phone padding -- the
 *      same class of rendered-only defect as (3) above, caught the same
 *      way, before shipping this time rather than after.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>;
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
  //      the bottom line to within other operating expenses;
  //   4. (2026-08-30) the Total cost % indicator, for the same reason as
  //      (2), only more sharply: total cost / revenue is ALGEBRAICALLY
  //      1 - net margin, so showing it to an account without VIEW_PNL
  //      would hand over the exact figure (2) withholds, by subtraction.
  //      It sits with Net margin % behind this flag, not with the four
  //      cost-control ratios below;
  //   5. (2026-08-30) the whole Expenses-by-category chart -- not just its
  //      dollar amounts, which is all (3) used to withhold.
  //
  // (5) closes a hole the original three items left open. Withholding
  // dollars but keeping per-category SHARES is not a gate, because the
  // shares alone finish the arithmetic:
  //     cogs/revenue      = Food cost % + Bar cost %      (both cards stay)
  //     otherOpex/cogs    = share(OTHER_EXPENSE) / share(FOOD+BEV)  (chart)
  //     => otherOpex/revenue, => Total cost %, => Net margin.
  // Verified exact on the unit-test fixture: 0.65 prime + 0.08 other =
  // 0.73 total cost, 0.27 net margin. Oliver's call (2026-08-30), after
  // being shown both options: close it here rather than redefine
  // VIEW_ANALYTICS as "approximate P&L access".
  //
  // Hiding only the chart's NUMBERS would have been cosmetic in the
  // literal sense -- BreakdownBarChart draws each bar at
  // `amount / maxAmount`, so the bar lengths ARE the shares, and the
  // "View as table" disclosure prints a Share column besides. The chart
  // has to not render. What a VIEW_ANALYTICS-only account keeps is the
  // four benchmarked cost ratios, which is the cost-control job that
  // capability exists for and which leaks nothing on its own.
  // Food/bar/labor/prime cost ratios and the breakdown SHARES stay --
  // "food is 31% of spend, up from 27%" is the cost-control job
  // VIEW_ANALYTICS exists for, and needs no dollar figures.
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_ANALYTICS")) return <NoAccess pageLabel="the Analytics page" />;
  const canSeePnL = viewer.has("VIEW_PNL");

  const params = await searchParams;
  const today = parseDate(businessTodayIso());
  const presets = computePresets(today);

  /* ?range=week|month|year instead of baked-in ?from=&to= links
   * (2026-08-31, Aey's run-through, two birds):
   *  - The three preset buttons can now show WHICH one you're on --
   *    the URL carries the mode, not just two dates that have to be
   *    reverse-matched against today's presets.
   *  - A bookmarked "This year" link used to freeze the dates it was
   *    minted with -- next January it would still open 2026. A range
   *    link computes its dates fresh on every load, so it keeps
   *    meaning what its label says.
   * Hand-picked ?from=&to= (the date form) still works and shows as
   * the honest fourth state: Custom, with no preset button active. */
  const range = params.range === "week" || params.range === "month" || params.range === "year" ? params.range : null;
  const hasCustom = !range && !!(params.from || params.to);
  const activeRange: "week" | "month" | "year" | "custom" = range ?? (hasCustom ? "custom" : "month");

  const from = range ? presets[range].from : params.from || presets.month.from;
  const to = range ? presets[range].to : params.to || presets.month.to;

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
            : `The "sweet spot" cost indicators and where revenue is coming from, for the range below — computed from finalized shifts and Ledger entries already in Atlas. Dollar totals and the expense breakdown are part of the P&L, which isn't turned on for your account.`
        }
      />

      <Card className="flex flex-wrap items-end gap-4 mb-6">
        {/* The active preset is SOLID (primary) and marked aria-current;
            the rest stay secondary. "You are here" must survive a glance
            from across a kitchen counter -- the numbers changing below
            is not an indicator (2026-08-31, Aey's run-through). */}
        <div className="flex flex-wrap gap-2 items-center">
          <LinkButton
            href="/analytics?range=week"
            variant={activeRange === "week" ? "primary" : "secondary"}
            size="sm"
            aria-current={activeRange === "week" ? "true" : undefined}
          >
            This week
          </LinkButton>
          <LinkButton
            href="/analytics?range=month"
            variant={activeRange === "month" ? "primary" : "secondary"}
            size="sm"
            aria-current={activeRange === "month" ? "true" : undefined}
          >
            This month
          </LinkButton>
          <LinkButton
            href="/analytics?range=year"
            variant={activeRange === "year" ? "primary" : "secondary"}
            size="sm"
            aria-current={activeRange === "year" ? "true" : undefined}
          >
            This year
          </LinkButton>
          {activeRange === "custom" && (
            <span className="inline-flex items-center min-h-9 px-3 rounded-[var(--radius-full)] bg-[var(--primary)] text-white text-sm font-medium">
              Custom dates
            </span>
          )}
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
      {/* 2026-08-30: adding Total cost % takes the VIEW_PNL grid from 5 to
          6 cards. Five-across was already tight -- each card carries a
          meter, a status line, a 2-3 line note AND a source line -- so
          this drops to 3-across (two even rows of three) rather than
          squeezing six into one row. The no-VIEW_PNL grid still has four
          cards and keeps 4-across. */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 ${canSeePnL ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <KpiMeterCard benchmark={pnl.kpis.foodCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.barCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.laborCostPct} />
        <KpiMeterCard benchmark={pnl.kpis.primeCostPct} />
        {/* Cost side first, then the two bottom-line figures it implies. */}
        {canSeePnL && <KpiMeterCard benchmark={pnl.kpis.totalCostPct} />}
        {canSeePnL && <KpiMeterCard benchmark={pnl.kpis.netMarginPct} />}
      </div>

      {/* Revenue / expense breakdown charts.

          The Expenses chart is VIEW_PNL-only as of 2026-08-30 -- see item
          (5) of the capability block above for why its shares alone
          reconstruct the bottom line. The Revenue chart stays for everyone
          (shares only): channel mix says nothing about costs, so it closes
          no arithmetic. With one chart instead of two, the grid drops to a
          single column rather than leaving a half-width hole. */}
      <div className={`grid grid-cols-1 gap-4 mb-8 ${canSeePnL ? "lg:grid-cols-2" : ""}`}>
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
        {canSeePnL && (
          <BreakdownBarChart
            title="Expenses by category"
            subtitle="Petty Cash + Supplier Check + Card, pooled by category. Payroll isn't shown here — see the P&L below, it's computed from actual shift wages instead."
            slices={expenseSlices}
            total={pnl.expenses.total}
            showAmounts
          />
        )}
      </div>
      {canSeePnL && pnl.expenses.excludedTotal > 0 && (
        <p className="text-xs text-[var(--ink-500)] -mt-6 mb-8">
          {/* 2026-08-30: this whole note is now VIEW_PNL-only, not just its
              dollar figure. It describes what was left out of the Expenses
              chart, and that chart no longer renders without VIEW_PNL --
              a footnote about an absent chart is worse than no footnote. */}
          Note: spending logged under the PAYROLL BOH/PAYROLL FOH ledger categories (
          {formatMoney(pnl.expenses.excludedTotal)}) was
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
              {/* Header added 2026-08-30 with the "% of sales" column. The
                  two-column version had no <thead> at all -- fine while
                  every row was a self-labelling label/amount pair, but a
                  bare "25.0%" in a third column is meaningless without a
                  column name (WCAG 1.3.1). The first column's name is
                  screen-reader-only: the row labels already carry it
                  visually, and printing "Line" above "Revenue" is noise. */}
              <thead className="bg-[var(--paper)] text-[var(--ink-500)] text-xs uppercase tracking-wide">
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="py-2 pl-2 sm:pl-3 pr-1 sm:pr-2 text-left font-medium">
                    <span className="sr-only">P&amp;L line</span>
                  </th>
                  {/* Deliberately NOT whitespace-nowrap, unlike the body cells
                      below. Measured at a 390px phone: nowrap here made
                      "% of sales" the widest thing in its column and pinned it
                      at 89px, squeezing the label column to 110px and wrapping
                      four row labels to 3-4 lines each. Letting the HEADER wrap
                      to two lines costs 12px once and buys every row back. */}
                  <th scope="col" className="py-2 px-1.5 sm:px-2 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pr-2 sm:pr-3 pl-1.5 sm:pl-2 text-right font-medium">
                    % of sales
                  </th>
                </tr>
              </thead>
              <tbody>
                <PnLRow label="Revenue" amount={pnl.revenue.total} share={pnl.shareOfRevenue.revenue} bold />
                <PnLRow label="Food cost" amount={-pnl.cogs.food} share={pnl.shareOfRevenue.food} indent />
                <PnLRow
                  label="Drinks cost (non-alcoholic)"
                  amount={-pnl.cogs.drinks}
                  share={pnl.shareOfRevenue.drinks}
                  indent
                />
                <PnLRow label="Bar cost (alcohol)" amount={-pnl.cogs.bar} share={pnl.shareOfRevenue.bar} indent />
                <PnLRow
                  label="Cost of goods sold"
                  amount={-pnl.cogs.total}
                  share={pnl.shareOfRevenue.cogs}
                  bold
                  border
                />
                <PnLRow
                  label="Gross profit"
                  amount={pnl.grossProfit}
                  share={pnl.shareOfRevenue.grossProfit}
                  bold
                  border
                />
                <PnLRow
                  label="Payroll — FOH"
                  amount={-pnl.payroll.foh}
                  share={pnl.shareOfRevenue.payrollFoh}
                  indent
                />
                <PnLRow
                  label="Payroll — BOH"
                  amount={-pnl.payroll.boh}
                  share={pnl.shareOfRevenue.payrollBoh}
                  indent
                />
                <PnLRow
                  label="Payroll total"
                  amount={-pnl.payroll.total}
                  share={pnl.shareOfRevenue.payrollTotal}
                  bold
                />
                <PnLRow
                  label="Other operating expenses"
                  amount={-pnl.otherOpex}
                  share={pnl.shareOfRevenue.otherOpex}
                  bold
                />
                {/* Total cost is the line Aey actually asked for -- the four
                    cost lines above it each answer "how much of sales is
                    THIS?", and nothing summed them. Placed directly before
                    Net profit because the two are complements: this row's
                    share plus the next row's share is always 100%. */}
                <PnLRow
                  label="Total cost"
                  amount={-pnl.totalCost}
                  share={pnl.shareOfRevenue.totalCost}
                  bold
                  border
                />
                <PnLRow
                  label="Net profit"
                  amount={pnl.netProfit}
                  share={pnl.shareOfRevenue.netProfit}
                  bold
                  border
                  highlight
                />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--ink-500)] mb-8">
            {/* "Total cost" is kept short in the table because the label column
                is the one that has to wrap on a phone -- the definition lives
                here, where there is room for a full sentence. It matters: cost
                of goods sold sits ABOVE Gross profit, so a reader scanning only
                the two rows directly above Total cost would expect it to be
                payroll + other, and be wrong by the whole COGS line. */}
            Total cost is cost of goods sold plus payroll plus other operating expenses — revenue minus total cost
            is net profit, so those last two rows split every dollar of sales between cost and profit. Only counts
            finalized shifts and Supplier Check payments already printed/paid — matches the same rules the Sales
            &amp; Tax and Supplier Check reports already use.
          </p>
        </>
      )}
    </main>
  );
}

function PnLRow({
  label,
  amount,
  share,
  bold = false,
  indent = false,
  border = false,
  highlight = false,
}: {
  label: string;
  amount: number;
  /** 0-1 share of revenue for the "% of sales" column, or null when there
   * is no revenue to divide by. Passed explicitly rather than derived from
   * `amount` on purpose: cost rows render a NEGATIVE amount (the statement
   * subtracts them) but a POSITIVE share, because "Food cost -$2,500 /
   * 25.0%" is the sentence Aey asked for and "-25.0%" is not. Deriving the
   * percentage from the display amount would silently negate every cost
   * line. See lib/analytics/loadPnL.ts's `shareOfRevenue`. */
  share: number | null;
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
  /* The share column is deliberately NOT red just because its row's amount
   * is. A cost line's share is a magnitude ("a quarter of sales"), not a
   * signed money value, and colouring every cost percentage red would say
   * "all five of these are problems" -- the exact cry-wolf failure the KPI
   * cards' `concernDirection` fix was made to stop. Red here means the
   * share ITSELF is negative, i.e. a real loss on gross or net profit. */
  const shareColor =
    share != null && share < 0
      ? "text-[var(--danger-700)]"
      : bold
        ? "text-[var(--ink-900)]"
        : "text-[var(--ink-700)]";
  return (
    <tr
      className={
        // A heavier, near-black rule for subtotal/total rows -- intentionally
        // stronger than the app's usual --border-strong divider, matching
        // standard accounting-statement styling for a subtotal line.
        border ? "border-t-2 border-[var(--ink-900)]" : "border-b border-[var(--border)]"
      }
    >
      {/* Padding is tighter below `sm` and the indent is smaller, because a
          390px phone leaves a ~308px content column once the 48px nav rail
          and the page's p-4 come out, and three columns now have to fit in
          it. Measured at 308px: the roomier desktop padding left the label
          column at 123px and wrapped four labels to 3 lines; this version
          gives it 134px and only "Drinks cost (non-alcoholic)" and "Other
          operating expenses" wrap, to 2 lines each, with no horizontal
          scroll. `sm:` restores the original spacing -- at a 640px viewport
          the rail grows to 216px but the content column still nets ~392px,
          wider than the phone case this tightening is for.

          The label is the only cell allowed to wrap: both numeric cells stay
          whitespace-nowrap so a long label costs a second line rather than
          breaking "-$1,234.56" across two. */}
      <td
        className={`py-2 pr-1 sm:pr-2 ${indent ? "pl-5 sm:pl-8 text-[var(--ink-500)]" : "pl-2 sm:pl-3 text-[var(--ink-900)]"} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </td>
      <td
        className={
          "py-2 px-1.5 sm:px-2 text-right tabular-nums whitespace-nowrap " +
          (bold ? "font-semibold " : "") +
          (highlight ? "text-lg " : "") +
          amountColor
        }
      >
        {formatMoney(amount)}
      </td>
      <td
        className={
          "py-2 pr-2 sm:pr-3 pl-1.5 sm:pl-2 text-right tabular-nums whitespace-nowrap " +
          (bold ? "font-semibold " : "") +
          (highlight ? "text-lg " : "") +
          shareColor
        }
      >
        {formatShare(share)}
      </td>
    </tr>
  );
}
