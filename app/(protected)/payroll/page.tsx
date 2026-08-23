import Link from "next/link";
import { loadPayrollRegister } from "@/lib/payroll/loadPayrollRegister";
import { toIso, weekStartFor, datesInWeek, shiftWeek } from "@/lib/schedule/weekMath";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { MarkPaidButton, RevertToDraftButton } from "./PayrollActions";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { formatShortDate } from "@/lib/formatDateTime";

function weekLabel(weekStart: string): string {
  const days = datesInWeek(weekStart);
  const start = new Date(`${days[0]}T12:00:00Z`);
  const end = new Date(`${days[6]}T12:00:00Z`);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${startStr} - ${endStr}`;
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
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const todayIso = toIso(new Date());
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? weekStartFor(params.week!) : weekStartFor(todayIso);

  const [register, session, viewer] = await Promise.all([
    loadPayrollRegister(weekStart),
    getCurrentStaffSession(),
    getViewerCapabilities(),
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
        description="What every employee is owed for the week, built from Atlas's own finalized shift payouts."
      />

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
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold text-sm px-4 py-2.5 min-h-11 border border-[var(--border-strong)] text-[var(--ink-700)] hover:bg-[var(--paper)] transition-colors"
            >
              Download .xlsx (check export + pay stubs + acknowledgment)
            </a>
          )}
          {register.status === "draft" && (
            <MarkPaidButton weekStartDate={weekStart} disabled={!register.canMarkPaid} />
          )}
          {register.status === "paid" && isAdmin && <RevertToDraftButton weekStartDate={weekStart} />}
        </div>
      )}
    </main>
  );
}
