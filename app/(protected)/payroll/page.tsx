import Link from "next/link";
import { loadPayrollRegister } from "@/lib/payroll/loadPayrollRegister";
import { loadPayrollYear, type PayrollMonthSummary } from "@/lib/payroll/loadPayrollYear";
import { MonthRow } from "@/app/(protected)/ledger/MonthRow";
import { TableCard } from "@/components/ui/Table";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { LinkButton } from "@/components/ui/Button";
import { weekStartFor, datesInWeek, shiftWeek } from "@/lib/schedule/weekMath";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { MarkPaidButton, RevertToDraftButton } from "./PayrollActions";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { formatShortDate, businessTodayIso } from "@/lib/formatDateTime";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";

function weekLabel(weekStart: string): string {
  const days = datesInWeek(weekStart);
  const start = new Date(`${days[0]}T12:00:00Z`);
  const end = new Date(`${days[6]}T12:00:00Z`);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${startStr} - ${endStr}`;
}

/** "Monday, Aug 31 – Sunday, Sep 6" — full weekday names, Aey's ask
 * (2026-08-31: "show list of week with full weekday and date format").
 * The weekday words are what make a payroll week unambiguous to a human
 * who thinks in "Monday to Sunday", not in ISO dates. */
function fullWeekLabel(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return `${fmt(weekStart, false)} – ${fmt(weekEnd, true)}`;
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Payroll (2026-08-17) — weekly payroll register. Reuses Atlas's own
 * already-computed shift payouts (see lib/payroll/loadPayrollRegister.ts),
 * one Monday-Sunday week at a time, matching the weekly cadence Soothr's
 * real payroll DNA file uses. A week stays DRAFT (live numbers, can
 * change if shift data changes) until every shift that week is
 * finalized and a manager marks it PAID, which locks a snapshot. See
 * project_atlas_payroll memory for the full design conversation.
 *
 * Restyled onto the design system 2026-08-19 -- the 7-column register
 * table gets the same stacked-cards-on-phone / table-on-desktop split
 * just applied to MonthList.tsx (same reasoning: a horizontally-
 * scrolling 7-column table at 375px is the exact anti-pattern that
 * convention exists to avoid), and money formatting now goes through
 * Ledger's shared formatMoney so it matches the rest of the app. The
 * mark-paid/revert actions in PayrollActions.tsx were already
 * retrofitted separately and aren't touched here. */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; month?: string; year?: string }>;
}) {
  // VIEW_PAYROLL gate (2026-08-31) ahead of every branch — the front
  // door, the month view and the register are one page with one guard.
  // The export route and the paid/revert actions carry their own
  // stricter FA_* checks independently.
  const gateViewer = await getViewerCapabilities();
  if (!gateViewer?.has("VIEW_PAYROLL")) return <NoAccess pageLabel="Payroll" />;

  const params = await searchParams;
  const todayIso = businessTodayIso();

  /* Three levels since 2026-08-31 (Aey's run-through — the register was
   * one week at a time behind Prev/Next, so a week eight weeks back took
   * eight clicks): bare /payroll -> a month picker for the year (same
   * front-door shape /ledger already taught her); ?month=YYYY-MM -> that
   * month's weeks in full weekday format; ?week= -> the register this
   * page has always been. A week files under the month its SUNDAY falls
   * in (Oliver's call, 2026-08-31): payroll leaves the bank after the
   * week closes, so months line up with the bank statement. */
  if (!params.week) {
    const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null;
    const year = month
      ? Number(month.slice(0, 4))
      : params.year && /^\d{4}$/.test(params.year)
        ? Number(params.year)
        : Number(todayIso.slice(0, 4));
    const months = await loadPayrollYear(year, todayIso);
    const currentWeekStart = weekStartFor(todayIso);

    if (month) {
      const m = months.find((x) => x.month === month);
      return <PayrollMonthView month={month} summary={m ?? null} currentWeekStart={currentWeekStart} />;
    }
    return <PayrollYearView year={year} months={months} currentWeekStart={currentWeekStart} />;
  }

  const weekStart = weekStartFor(params.week);

  const [register, session, viewer, settings] = await Promise.all([
    loadPayrollRegister(weekStart),
    getCurrentStaffSession(),
    getViewerCapabilities(),
    loadRestaurantSettings(),
  ]);
  // Gate the control as well as the route (2026-08-23). The export handler
  // enforces this independently; rendering a download link that answers
  // with a denial is the dead-end this project keeps re-finding.
  const canExportPayroll = viewer?.has("FA_PAYROLL_PRINT_EXPORT") ?? false;
  const isAdmin = session?.systemRole === "ADMIN";

  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8">
      <PageHeader
        title="Payroll"
        description="What every employee is owed for the week, built from Mohom's own finalized shift payouts."
      />

      <div className="mb-2">
        <Link
          href={`/payroll?month=${datesInWeek(weekStart)[6].slice(0, 7)}`}
          className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
        >
          &larr; All weeks of {monthTitle(datesInWeek(weekStart)[6].slice(0, 7))}
        </Link>
      </div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link href={`/payroll?week=${prevWeek}`} className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          &larr; Prev week
        </Link>
        <div className="text-sm font-medium text-[var(--ink-900)]">{weekLabel(weekStart)}</div>
        <Link href={`/payroll?week=${nextWeek}`} className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          Next week &rarr;
        </Link>
      </div>

      <div className="mb-4">
        {register.status === "paid" ? (
          <Badge tone="success">
            Paid{register.paidByName ? ` — by ${register.paidByName}` : ""}
            {/* Honest about how it was locked (2026-09-01): a week closed
                while the two-person control was off must not read later as
                though a second person had checked it. */}
            {register.paidSinglePerson && (
              <span className="ml-2 text-xs font-normal text-[var(--ink-500)]">· locked by one person</span>
            )}
            {register.paidAt ? ` on ${formatShortDate(register.paidAt)}` : ""}
          </Badge>
        ) : (
          <Badge tone="neutral">Draft — live numbers</Badge>
        )}
      </div>

      {register.status === "draft" && register.unfinalizedShiftCount > 0 && (
        <div className="mb-4">
          <Banner
            tone="warning"
            title={`${register.unfinalizedShiftCount} shift${register.unfinalizedShiftCount === 1 ? "" : "s"} not finalized yet`}
            description={`Finalize every shift this week before this week's payroll can be marked paid.`}
          />
        </div>
      )}

      {register.rows.length === 0 ? (
        <div className="mb-4">
          <EmptyState message="No finalized shift payouts for this week yet." />
        </div>
      ) : (
        <>
          {/* Phone: stacked cards */}
          <div className="lg:hidden space-y-2 mb-4">
            {register.rows.map((row) => (
              <div key={row.employeeId} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[var(--ink-900)]">{row.employeeName}</span>
                  <span className="font-semibold tabular-nums text-[var(--ink-900)]">{formatMoney(row.totalCorePayout)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-500)]">Wage</span>
                    <span className="tabular-nums text-[var(--ink-700)]">{formatMoney(row.flatWageAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-500)]">Extra</span>
                    <span className="tabular-nums text-[var(--ink-700)]">{formatMoney(row.extraPayAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-500)]">Incentive</span>
                    <span className="tabular-nums text-[var(--ink-700)]">{formatMoney(row.incentiveAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-500)]">Deduction</span>
                    <span className={"tabular-nums " + (row.deductionAmount > 0 ? "text-[var(--danger)]" : "text-[var(--ink-700)]")}>
                      {row.deductionAmount > 0 ? formatMoney(-row.deductionAmount) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--ink-500)]">Tip</span>
                    <span className="tabular-nums text-[var(--ink-700)]">{formatMoney(row.totalTip)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-lg)] p-4 flex items-center justify-between">
              <span className="font-semibold text-[var(--ink-900)]">Total</span>
              <span className="font-semibold tabular-nums text-[var(--ink-900)]">{formatMoney(register.total)}</span>
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block border border-[var(--border)] rounded-[var(--radius-lg)] overflow-x-auto mb-4">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-[var(--paper)] text-[var(--ink-500)] text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Employee</th>
                  <th className="text-right py-2 px-3 font-medium">Wage</th>
                  <th className="text-right py-2 px-3 font-medium">Extra</th>
                  <th className="text-right py-2 px-3 font-medium">Incentive</th>
                  <th className="text-right py-2 px-3 font-medium">Deduction</th>
                  <th className="text-right py-2 px-3 font-medium">Tip</th>
                  <th className="text-right py-2 px-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {register.rows.map((row) => (
                  <tr key={row.employeeId} className="border-t border-[var(--border)]">
                    <td className="py-2 px-3 text-[var(--ink-900)]">{row.employeeName}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{formatMoney(row.flatWageAmount)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{formatMoney(row.extraPayAmount)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{formatMoney(row.incentiveAmount)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {row.deductionAmount > 0 ? (
                        <span className="text-[var(--danger)]">{formatMoney(-row.deductionAmount)}</span>
                      ) : (
                        <span className="text-[var(--ink-700)]">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{formatMoney(row.totalTip)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-[var(--ink-900)]">
                      {formatMoney(row.totalCorePayout)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border)] bg-[var(--paper)]">
                  <td className="py-2 px-3 font-semibold text-[var(--ink-900)]" colSpan={6}>
                    Total
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-[var(--ink-900)]">
                    {formatMoney(register.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {register.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {canExportPayroll && (
            <a
              href={`/payroll/export?week=${weekStart}`}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold text-sm px-4 py-2.5 min-h-11 border border-[var(--border-strong)] text-[var(--ink-700)] hover:bg-[var(--hover)] transition-colors"
            >
              Download .xlsx (check export + pay stubs + acknowledgment)
            </a>
          )}
          {register.status === "draft" && (
            <MarkPaidButton weekStartDate={weekStart} disabled={!register.canMarkPaid} requireSecondPerson={settings.requireTwoPersonPayroll} />
          )}
          {register.status === "paid" && isAdmin && <RevertToDraftButton weekStartDate={weekStart} />}
        </div>
      )}
    </main>
  );
}

/** Year front door: one row per month, weeks filed by their Sunday. */
function PayrollYearView({
  year,
  months,
  currentWeekStart,
}: {
  year: number;
  months: PayrollMonthSummary[];
  currentWeekStart: string;
}) {
  return (
    <main className="max-w-lg lg:max-w-3xl mx-auto p-4 sm:p-8">
      <PageHeader
        title="Payroll"
        description="Pick a month, then a week, to see that week's register. A week belongs to the month its Sunday falls in — same as the bank statement."
        actions={<LinkButton href={`/payroll?week=${currentWeekStart}`}>This week&apos;s register</LinkButton>}
      />

      <div className="flex items-center justify-between mb-3">
        <Link href={`/payroll?year=${year - 1}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          &larr; {year - 1}
        </Link>
        <span className="font-medium text-sm text-[var(--ink-900)]">{year}</span>
        <Link href={`/payroll?year=${year + 1}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          {year + 1} &rarr;
        </Link>
      </div>

      {/* Phone: stacked cards */}
      <div className="lg:hidden space-y-2">
        {months.map((m) => {
          const content = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className={"font-semibold " + (m.isFuture ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>
                  {m.name}
                  {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This month</span>}
                </span>
                {!m.isFuture && (
                  <Badge tone={m.paidWeekCount === m.weeks.length ? "success" : "neutral"}>
                    {m.paidWeekCount}/{m.weeks.length} paid
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-500)]">
                  {m.weeks.length} week{m.weeks.length === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums text-[var(--ink-900)] font-medium">
                  {m.paidTotal > 0 ? formatMoney(m.paidTotal) : "—"}
                </span>
              </div>
            </>
          );
          return m.isFuture ? (
            <div key={m.month} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 opacity-60">
              {content}
            </div>
          ) : (
            <Link
              key={m.month}
              href={`/payroll?month=${m.month}`}
              className={
                "block bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 " +
                (m.isCurrent ? "border-[var(--warning-border)] bg-[var(--warning-tint)]" : "border-[var(--border)]")
              }
            >
              {content}
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
        <TableCard>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
                <th className="py-2 px-3 font-medium">Month</th>
                <th className="py-2 px-3 font-medium text-right">Weeks</th>
                <th className="py-2 px-3 font-medium text-right">Paid</th>
                <th className="py-2 px-3 font-medium text-right">Paid total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) =>
                m.isFuture ? (
                  <tr key={m.month} className="border-b border-[var(--border)] opacity-60">
                    <td className="py-2.5 px-3">{m.name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{m.weeks.length}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--ink-500)]">Not yet</td>
                    <td className="py-2.5 px-3 text-right text-[var(--ink-500)]">—</td>
                  </tr>
                ) : (
                  <MonthRow key={m.month} href={`/payroll?month=${m.month}`} isToday={m.isCurrent}>
                    <td className="py-2.5 px-3">
                      <Link href={`/payroll?month=${m.month}`} className="font-medium text-[var(--ink-900)]">
                        {m.name}
                      </Link>
                      {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)]">This month</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{m.weeks.length}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {m.paidWeekCount}/{m.weeks.length}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">
                      {m.paidTotal > 0 ? formatMoney(m.paidTotal) : "—"}
                    </td>
                  </MonthRow>
                )
              )}
            </tbody>
          </table>
        </TableCard>
      </div>
    </main>
  );
}

/** One month's weeks, full weekday format, each linking to its register. */
function PayrollMonthView({
  month,
  summary,
  currentWeekStart,
}: {
  month: string;
  summary: PayrollMonthSummary | null;
  currentWeekStart: string;
}) {
  const weeks = summary?.weeks ?? [];
  return (
    <main className="max-w-lg lg:max-w-2xl mx-auto p-4 sm:p-8">
      <div className="mb-2">
        <Link
          href={`/payroll?year=${month.slice(0, 4)}`}
          className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
        >
          &larr; All months of {month.slice(0, 4)}
        </Link>
      </div>
      <PageHeader
        title={`Payroll — ${monthTitle(month)}`}
        description="Weeks that close (Sunday) in this month. Tap a week to open its register."
      />

      {weeks.length === 0 ? (
        <EmptyState message="No payroll weeks close in this month." />
      ) : (
        <div className="space-y-2">
          {weeks.map((w) => {
            const label = fullWeekLabel(w.weekStart, w.weekEnd);
            const content = (
              <>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className={"text-sm font-semibold " + (w.isFuture ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>
                    {label}
                    {w.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This week</span>}
                  </span>
                  {!w.isFuture &&
                    (w.status === "paid" ? <Badge tone="success">Paid</Badge> : <Badge tone="neutral">Draft</Badge>)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--ink-500)]">
                    {w.isFuture
                      ? "Not yet"
                      : w.shiftCount === 0
                        ? "No shifts"
                        : w.status === "paid"
                          ? `${w.shiftCount} shift${w.shiftCount === 1 ? "" : "s"}`
                          : `${w.finalizedShiftCount}/${w.shiftCount} shift${w.shiftCount === 1 ? "" : "s"} finalized`}
                  </span>
                  <span className="tabular-nums font-medium text-[var(--ink-900)]">
                    {w.paidTotal != null ? formatMoney(w.paidTotal) : "—"}
                  </span>
                </div>
              </>
            );
            return w.isFuture && !w.isCurrent ? (
              <div key={w.weekStart} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 opacity-60">
                {content}
              </div>
            ) : (
              <Link
                key={w.weekStart}
                href={`/payroll?week=${w.weekStart}`}
                className={
                  "block bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 hover:bg-[var(--primary-tint)] " +
                  (w.isCurrent ? "border-[var(--warning-border)] bg-[var(--warning-tint)]" : "border-[var(--border)]")
                }
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
      {/* currentWeekStart keeps the quick path visible even from an old month */}
      {!weeks.some((w) => w.isCurrent) && (
        <div className="mt-4">
          <LinkButton href={`/payroll?week=${currentWeekStart}`} variant="secondary" size="sm">
            Jump to this week&apos;s register →
          </LinkButton>
        </div>
      )}
    </main>
  );
}
