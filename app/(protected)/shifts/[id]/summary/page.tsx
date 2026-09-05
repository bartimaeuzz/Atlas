import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSummaryData } from "@/lib/shift/loadSummaryData";
import { loadShiftAttendanceSummary } from "@/lib/shift/loadRosterPageData";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { activityLog, employees } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ReopenShiftButton } from "./ReopenShiftButton";
import { AttendanceCoverageCard } from "../AttendanceCoverageCard";
import { ShiftStageNav } from "../ShiftStageNav";
import { ShiftWeatherLine } from "../ShiftWeatherLine";
import { Fragment } from "react";
import { Card, Section } from "@/components/ui/Card";
import { TableCard } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatDayLabelLong, formatDayLabelShort, weekdayLongOf } from "@/lib/format/formatDayLabel";
import { loadDailyNetSales, netSalesAmounts } from "@/lib/analytics/loadDailyNetSales";
import { loadSalesTargets } from "@/lib/analytics/loadSalesTargets";
import {
  TREND_WEEKS,
  resolveSalesTarget,
  salesDifference,
  salesTrend,
  salesVerdict,
  trendLookbackStart,
} from "@/lib/analytics/salesTarget";
import { formatDateTime } from "@/lib/formatDateTime";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const [data, attendance, session, reopenHistory] = await Promise.all([
    loadSummaryData(shiftId),
    loadShiftAttendanceSummary(shiftId),
    getCurrentStaffSession(),
    db
      .select({ at: activityLog.at, summary: activityLog.summary, actorName: employees.nickname })
      .from(activityLog)
      .innerJoin(employees, eq(activityLog.actorEmployeeId, employees.id))
      .where(and(eq(activityLog.entityType, "shift"), eq(activityLog.entityId, String(shiftId)), eq(activityLog.type, "shift.reopened")))
      .orderBy(desc(activityLog.at)),
  ]);

  if (!data.shift) notFound();

  if (data.shift.status !== "finalized" || !data.tipPoolCalculation) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <h1 className="text-2xl font-bold text-[var(--ink-900)] mb-2">Summary Report</h1>
        <p className="text-sm text-[var(--ink-500)] mb-4">
          This shift ({data.shift.date}, {data.shift.period}) hasn&apos;t been saved &amp; finalized yet.
        </p>
        <Link href={`/shifts/${shiftId}/closing-report`} className={`text-[var(--primary)] font-medium hover:underline ${TAP_TARGET_PAD}`}>
          Go to Closing Report →
        </Link>
      </main>
    );
  }

  // Sales target and trend for the DAY this shift belongs to (2026-09-04).
  // Day, not shift, on purpose: the target the partners set in the meeting
  // is a day's number, and Lunch and Dinner are two shifts of one day. The
  // block below therefore reports the whole date's net sales — which is
  // more than the "Total sales" card above it on a two-shift day, and says
  // so in words rather than leaving two different figures unexplained.
  //
  // One window covers both questions: the trend needs the four previous
  // same weekdays, and the day itself is the last date in the same range.
  const shiftDate = data.shift.date;
  const [dayNetSales, salesTargets] = await Promise.all([
    loadDailyNetSales(trendLookbackStart(shiftDate), shiftDate),
    loadSalesTargets(),
  ]);
  const day = dayNetSales.byDate[shiftDate] ?? null;
  const salesTarget = resolveSalesTarget(shiftDate, salesTargets);
  const trend = salesTrend(shiftDate, netSalesAmounts(dayNetSales.byDate));

  const totalPayout = data.payouts.reduce((a, p) => a + p.totalCorePayout, 0);
  // Per-column subtotals (2026-08-31, Aey: "need subtotal in each and
  // every column on summary closing report. easier for Aey to check back
  // each column") — she reconciles this sheet column by column against
  // Toast and the tip-pool math, and a foot total only on the last
  // column made every other column a by-hand addition.
  const sum = (f: (p: (typeof data.payouts)[number]) => number) => data.payouts.reduce((a, p) => a + f(p), 0);
  const columnTotals = {
    pool1: sum((p) => p.pool1Share),
    pool2: sum((p) => p.pool2Share),
    pool3: sum((p) => p.pool3Share),
    drinkBonus: sum((p) => p.hostUpsellTipShare),
    totalTip: sum((p) => p.totalTip),
    wage: sum((p) => p.flatWageAmount),
    extra: sum((p) => p.extraPayAmount),
    incentive: sum((p) => p.incentiveAmount),
    deduction: sum((p) => p.deductionAmount),
  };
  const payoutGroups = [
    { header: "Floor Manager", items: data.payouts.filter((p) => p.positionName === "Floor Manager") },
    { header: "FOH — Front of house", items: data.payouts.filter((p) => p.positionName !== "Floor Manager" && p.positionCategory === "FOH") },
    { header: "BOH — Back of house", items: data.payouts.filter((p) => p.positionName !== "Floor Manager" && p.positionCategory !== "FOH") },
  ].filter((g) => g.items.length > 0);

  return (
    <main
      // 2026-08-24 standards pass, mirroring the Preview page: 6xl on
      // desktop so the 13-column table shows whole, long/short date pair,
      // Finalized badge, TableCard border, FM/FOH/BOH grouping.
      className="max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-8 py-8"
    >
      <p className="text-sm mb-2">
        <Link href={`/shifts?month=${data.shift.date.slice(0, 7)}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          ← Back to {data.shift.date.slice(0, 7)}
        </Link>
      </p>
      <div className="flex items-center gap-2.5 mb-1.5">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">
          <span className="hidden sm:inline">Summary Report — {formatDayLabelLong(data.shift.date)} ({data.shift.period})</span>
          <span className="sm:hidden">Summary Report — {formatDayLabelShort(data.shift.date)} ({data.shift.period})</span>
        </h1>
        <StatusBadge status="finalized" />
      </div>
      <ShiftStageNav shiftId={shiftId} current="payout" />
      <p className="text-sm text-[var(--ink-500)] mb-2">
        Finalized{data.shift.finalizedByName ? ` by ${data.shift.finalizedByName}` : ""}
        {data.shift.finalizedAt ? ` — ${formatDateTime(data.shift.finalizedAt)}` : ""} — figures below are a
        locked snapshot, not recalculated live.
        {/* The "closed" financial state made visible (2026-08-26): once
            the week is paid this record is permanent for everyone. */}
        {data.shift.weekPaid && (
          <span className="ml-1.5 inline-flex items-center whitespace-nowrap text-xs font-medium border rounded-[var(--radius-full)] px-2 py-0.5 bg-[var(--success-tint)] text-[var(--success-700)] border-[var(--success-border)]">
            Week paid — closed
          </span>
        )}
      </p>
      {/* Reversal trail (2026-08-26): a shift that was ever reopened says
          so on its permanent record, with who and why -- the financial
          "amended, with an audit trail" state. */}
      {reopenHistory.length > 0 && (
        <div className="mb-6 text-xs text-[var(--warning-700)] space-y-0.5">
          {reopenHistory.map((h, i) => (
            <p key={i}>
              ⟳ {h.summary} — {h.actorName}, {formatDateTime(h.at)}
            </p>
          ))}
        </div>
      )}
      <div className="mb-8" />

      {/* The day's record rides on the permanent report too (2026-08-25,
          Oliver: "#4 it should" -- same cards the Preview shows). */}
      {(attendance.marks.length > 0 || attendance.coverage.length > 0 || data.shift.incidentReport) && (
        <div className="space-y-4 mb-8 max-w-3xl">
          <AttendanceCoverageCard attendance={attendance} />
          {data.shift.incidentReport && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--paper)]">
                Incident report
              </div>
              <p className="px-3 py-2.5 text-sm text-[var(--ink-900)] whitespace-pre-line">{data.shift.incidentReport}</p>
            </div>
          )}
        </div>
      )}

      <section className="mb-8 grid sm:grid-cols-3 gap-3">
        <StatCard label="Total sales" value={data.sales?.totalSales ?? 0} />
        <StatCard label="CC tip total" value={data.tipPoolCalculation.grossCcTip} />
        <StatCard label="Cash sales" value={data.sales?.cashSales ?? 0} />
      </section>

      <DayVsTarget
        date={shiftDate}
        netSales={day?.netSales ?? null}
        dayComplete={day?.complete ?? false}
        target={salesTarget}
        trend={trend}
      />

      {/* Directly under the target verdict, deliberately (2026-09-05,
          Oliver): the miss and the reason for it are one thought, and a
          weather line three sections away is a fact nobody connects. Reads
          from the frozen row only — no network call on a locked record. */}
      <ShiftWeatherLine
        date={data.shift.date}
        period={data.shift.period as "Lunch" | "Dinner"}
        isFinalized
      />

      <Section title="Tip pools">
        <Card className="max-w-md">
          <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
            <Row label="Deduction rate" value={`${(data.tipPoolCalculation.deductionRate * 100).toFixed(1)}%`} />
            <Row label="Net CC tip (after deduction)" value={`$${data.tipPoolCalculation.netCcTip.toFixed(2)}`} />
            {(data.sales?.cashTip ?? 0) > 0 && (
              <Row label="Cash tip (added to Pool 1, no deduction)" value={`$${(data.sales?.cashTip ?? 0).toFixed(2)}`} />
            )}
            {data.tipPoolCalculation.totalHostUpsellTip > 0 && (
              <Row
                label="Host drink bonus (pulled off Pool 1 top)"
                value={`$${data.tipPoolCalculation.totalHostUpsellTip.toFixed(2)}`}
              />
            )}
            {data.tipPoolCalculation.perRoleBreakdown && (
              <>
                <Row label="Pool 1 (dine-in)" value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool1 ?? 0).toFixed(2)}`} />
                <Row
                  label="Pool 2 (pickup / takeout)"
                  value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool2 ?? 0).toFixed(2)}`}
                />
                <Row label="Pool 3 (delivery, equal split)" value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool3 ?? 0).toFixed(2)}`} />
              </>
            )}
          </dl>
        </Card>
      </Section>

      <Section title="Payout by employee">
        {/* Grouped like the roster and preview pages: Floor Manager first,
            then FOH, then BOH, same headers. */}
        <div className="lg:hidden space-y-2">
          {payoutGroups.map((g) => (
            <div key={g.header}>
              <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase mb-1.5 mt-3 first:mt-0">{g.header}</h3>
              <div className="space-y-2">
          {g.items.map((p) => (
            <Card key={p.employeeId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--ink-900)]">{p.employeeName}</div>
                  <div className="text-xs text-[var(--ink-500)]">
                    {p.positionName}
                    {/* != null, not truthiness: a deliberate 0 pt is a real
                        decision (this person takes no share of the pool) and
                        must not render as nothing -- 2026-08-30. */}
                    {p.pointValueUsed != null ? ` · ${p.pointValueUsed} pt` : ""}
                  </div>
                </div>
                <div className="text-lg font-bold text-[var(--ink-900)] tabular-nums">${p.totalCorePayout.toFixed(2)}</div>
              </div>
              <dl className="text-xs grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--border)] pt-2">
                {p.pool1Share > 0 && <MiniRow label="Pool 1" value={`$${p.pool1Share.toFixed(2)}`} />}
                {p.pool2Share > 0 && <MiniRow label="Pool 2" value={`$${p.pool2Share.toFixed(2)}`} />}
                {p.pool3Share > 0 && <MiniRow label="Pool 3" value={`$${p.pool3Share.toFixed(2)}`} />}
                {p.hostUpsellTipShare > 0 && <MiniRow label="Drink bonus" value={`$${p.hostUpsellTipShare.toFixed(2)}`} />}
                <MiniRow label="Total tip" value={`$${p.totalTip.toFixed(2)}`} />
                <MiniRow label="Flat wage" value={`$${p.flatWageAmount.toFixed(2)}`} />
                {p.extraPayAmount > 0 && <MiniRow label="Extra pay" value={`$${p.extraPayAmount.toFixed(2)}`} />}
                {p.incentiveAmount > 0 && <MiniRow label="Incentive" value={`$${p.incentiveAmount.toFixed(2)}`} />}
                {p.deductionAmount > 0 && <MiniRow label="Deduction" value={`-$${p.deductionAmount.toFixed(2)}`} tone="danger" />}
              </dl>
            </Card>
          ))}
              </div>
            </div>
          ))}
          <Card className="p-4 bg-[var(--paper)]">
            <div className="flex items-center justify-between font-semibold text-[var(--ink-900)] mb-2">
              <span>Totals</span>
              <span className="tabular-nums">${totalPayout.toFixed(2)}</span>
            </div>
            {/* Same per-column subtotals the desktop tfoot carries
                (2026-08-31, Aey) — the phone must not lose the
                check-each-column workflow. */}
            <dl className="text-xs grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[var(--border)] pt-2">
              {columnTotals.pool1 > 0 && <MiniRow label="Pool 1" value={`$${columnTotals.pool1.toFixed(2)}`} />}
              {columnTotals.pool2 > 0 && <MiniRow label="Pool 2" value={`$${columnTotals.pool2.toFixed(2)}`} />}
              {columnTotals.pool3 > 0 && <MiniRow label="Pool 3" value={`$${columnTotals.pool3.toFixed(2)}`} />}
              {columnTotals.drinkBonus > 0 && <MiniRow label="Drink bonus" value={`$${columnTotals.drinkBonus.toFixed(2)}`} />}
              <MiniRow label="Total tip" value={`$${columnTotals.totalTip.toFixed(2)}`} />
              <MiniRow label="Flat wage" value={`$${columnTotals.wage.toFixed(2)}`} />
              {columnTotals.extra > 0 && <MiniRow label="Extra pay" value={`$${columnTotals.extra.toFixed(2)}`} />}
              {columnTotals.incentive > 0 && <MiniRow label="Incentive" value={`$${columnTotals.incentive.toFixed(2)}`} />}
              {columnTotals.deduction > 0 && <MiniRow label="Deduction" value={`-$${columnTotals.deduction.toFixed(2)}`} tone="danger" />}
            </dl>
          </Card>
        </div>

        <TableCard>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
              <th className="py-2 px-3 font-medium">Employee</th>
              <th className="py-2 px-3 font-medium">Position</th>
              <th className="py-2 px-3 text-right font-medium">Point value</th>
              <th className="py-2 px-3 text-right font-medium" title="Pool 1 — dine-in">Pool 1</th>
              <th className="py-2 px-3 text-right font-medium" title="Pool 2 — pickup / takeout">Pool 2</th>
              <th className="py-2 px-3 text-right font-medium" title="Pool 3 — delivery">Pool 3</th>
              <th className="py-2 px-3 text-right font-medium">Drink bonus</th>
              <th className="py-2 px-3 text-right font-medium">Total tip</th>
              <th className="py-2 px-3 text-right font-medium">Flat wage</th>
              <th className="py-2 px-3 text-right font-medium">Extra pay</th>
              <th className="py-2 px-3 text-right font-medium">Incentive</th>
              <th className="py-2 px-3 text-right font-medium">Deduction</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {payoutGroups.map((g) => (
              <Fragment key={g.header}>
              <tr className="border-b border-[var(--border)] bg-[var(--paper)]">
                <td colSpan={13} className="py-1.5 px-3 text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase">{g.header}</td>
              </tr>
            {g.items.map((p) => (
              <tr key={p.employeeId} className="border-b border-[var(--border)]">
                <td className="py-2 px-3 text-[var(--ink-900)]">{p.employeeName}</td>
                <td className="py-2 px-3 text-[var(--ink-500)]">{p.positionName}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.pointValueUsed ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.pool1Share > 0 ? `$${p.pool1Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.pool2Share > 0 ? `$${p.pool2Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.pool3Share > 0 ? `$${p.pool3Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.hostUpsellTipShare > 0 ? `$${p.hostUpsellTipShare.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">${p.totalTip.toFixed(2)}</td>
                <td className="py-2 px-3 text-right tabular-nums">${p.flatWageAmount.toFixed(2)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.extraPayAmount > 0 ? `$${p.extraPayAmount.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">{p.incentiveAmount > 0 ? `$${p.incentiveAmount.toFixed(2)}` : "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {p.deductionAmount > 0 ? <span className="text-[var(--danger)]">{`-$${p.deductionAmount.toFixed(2)}`}</span> : "—"}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">${p.totalCorePayout.toFixed(2)}</td>
              </tr>
            ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border-strong)] font-semibold">
              <td className="py-2.5 px-3">Total</td>
              {/* Point value stays blank on purpose: points are per-pool
                  weights, and adding them across pools would print a
                  number that means nothing. */}
              <td colSpan={2}></td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.pool1 > 0 ? `$${columnTotals.pool1.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.pool2 > 0 ? `$${columnTotals.pool2.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.pool3 > 0 ? `$${columnTotals.pool3.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.drinkBonus > 0 ? `$${columnTotals.drinkBonus.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">${columnTotals.totalTip.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">${columnTotals.wage.toFixed(2)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.extra > 0 ? `$${columnTotals.extra.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{columnTotals.incentive > 0 ? `$${columnTotals.incentive.toFixed(2)}` : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">
                {columnTotals.deduction > 0 ? <span className="text-[var(--danger)]">{`-$${columnTotals.deduction.toFixed(2)}`}</span> : "—"}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">${totalPayout.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        </TableCard>
        <p className="text-xs text-[var(--ink-500)] mt-3">
          Incentive column reflects any fired Incentive Rules (2026-08-10) — currently scoped to flat-rate, per-shift,
          category-targeted rules (e.g. the $10k-total-sales BOH bonus). Manager/Floor Manager weekly commission still needs
          per-employee weighting and WEEK-period evaluation, not built yet.
        </p>
      </Section>
      {/* Reversal door (2026-08-26; widened same day per Aey's
          small-restaurant point): the manager who finalized this shift,
          or an Admin. A PAID week is "closed" -- no button for anyone,
          just the wall stated plainly; Admins can still revert the whole
          payroll week from the Payroll page, a big visible act. */}
      {(session?.systemRole === "ADMIN" ||
        (session?.systemRole === "MANAGER" && session.id === data.shift.finalizedByEmployeeId)) && (
        <div className="mt-8">
          {data.shift.weekPaid ? (
            <p className="text-xs text-[var(--ink-500)]">
              This week&apos;s payroll is marked paid — the record is closed. An Admin can revert the payroll week
              (Payroll page) if it truly must change.
            </p>
          ) : (
            <ReopenShiftButton shiftId={shiftId} shiftLabel={`${data.shift.date} (${data.shift.period})`} />
          )}
        </div>
      )}
    </main>
  );
}

/** The day's sales against the target the partners set, plus how this
 * weekday usually goes (2026-09-04, competitor-DNA backlog item 1 — "Today
 * / Target / Difference beside the headline number").
 *
 * Renders nothing at all when there is neither a target nor any history:
 * Youk opens with exactly that, and an empty card explaining its own
 * emptiness on every closing report for months is worse than no card.
 *
 * TARGET and TREND are kept visually and verbally apart because they
 * answer different questions — the plan, and the habit. A day can beat one
 * and miss the other, and that is the interesting case.
 *
 * The figure is the WHOLE DAY, not this shift: a target set in a meeting
 * is a day's number. On a two-shift day that makes it larger than the
 * "Total sales" card above, so the subtitle says which is which rather
 * than leaving a manager to reconcile two numbers by themselves. And while
 * any shift on the date is still open the comparison is stated without a
 * verdict — "short by $1,700" is true at 6pm and useless.
 */
function DayVsTarget({
  date,
  netSales,
  dayComplete,
  target,
  trend,
}: {
  date: string;
  netSales: number | null;
  dayComplete: boolean;
  target: number | null;
  trend: { average: number; weeks: number } | null;
}) {
  if (target == null && trend == null) return null;

  const judgeable = target != null && dayComplete && netSales != null && netSales > 0;
  const verdict = judgeable ? salesVerdict(netSales, target) : "none";
  const diff = Math.abs(salesDifference(netSales, target) ?? 0);
  const weekday = weekdayLongOf(date);
  const trendDiff = trend && netSales != null ? Math.round((netSales - trend.average) * 100) / 100 : null;

  return (
    <Card className="mb-8 max-w-md">
      <div className="text-xs text-[var(--ink-500)] mb-2">
        {target != null ? "Sales target" : "How this day usually goes"} — the whole day, both
        services
      </div>

      {/* netSales null means the day's rollup produced nothing for this
          date. Rendering "$0 of $3,800" there would state a figure nobody
          measured — the target line is simply absent instead, and the
          trend below still says what this weekday usually does. */}
      {target != null && netSales != null && (
        <div className="text-sm text-[var(--ink-900)]">
          <span className="tabular-nums font-medium">{money(netSales)}</span> of{" "}
          <span className="tabular-nums">{money(target)}</span>
          {verdict === "over" && (
            <span className="text-[var(--success-700)] font-medium"> · beat it by {money(diff)}</span>
          )}
          {verdict === "under" && (
            <span className="text-[var(--danger-700)] font-medium"> · {money(diff)} short</span>
          )}
        </div>
      )}

      {target != null && netSales != null && !dayComplete && (
        <p className="text-xs text-[var(--ink-500)] mt-1">
          Part of this day is not closed yet, so this is the day so far — no verdict until it is.
        </p>
      )}

      {trend && (
        <p className={"text-sm text-[var(--ink-700)] " + (target != null && netSales != null ? "mt-2" : "")}>
          {/* "so far" goes on the COUNT, not after the weekday. Read live
              2026-09-04, "The last 2 Mondays so far averaged" parses as
              though the Mondays were unfinished rather than the history. */}
          {trend.weeks < TREND_WEEKS ? "Only " : "The last "}
          {trend.weeks === 1 ? `1 ${weekday}` : `${trend.weeks} ${weekday}s`}
          {trend.weeks < TREND_WEEKS ? " so far, and they" : ""} averaged{" "}
          <span className="tabular-nums">{money(trend.average)}</span>
          {trendDiff != null && trendDiff !== 0 && (
            <>
              {" "}
              — this one is <span className="tabular-nums">{money(Math.abs(trendDiff))}</span>{" "}
              {trendDiff > 0 ? "above" : "below"} that
            </>
          )}
          .
        </p>
      )}
    </Card>
  );
}

/** Whole dollars. A target is a round number decided in a meeting and the
 * cent belongs on the table above, not in a sentence about it. */
function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-[var(--ink-500)] mb-1">{label}</div>
      <div className="text-xl font-bold text-[var(--ink-900)] tabular-nums">${value.toFixed(2)}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-[var(--ink-500)]">{label}</dt>
      <dd className="text-right tabular-nums text-[var(--ink-900)]">{value}</dd>
    </div>
  );
}

function MiniRow({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="contents">
      <dt className="text-[var(--ink-500)]">{label}</dt>
      <dd className={`text-right tabular-nums ${tone === "danger" ? "text-[var(--danger)]" : "text-[var(--ink-900)]"}`}>{value}</dd>
    </div>
  );
}
