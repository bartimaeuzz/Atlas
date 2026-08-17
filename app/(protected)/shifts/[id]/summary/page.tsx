import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSummaryData } from "@/lib/shift/loadSummaryData";
import { Card, Section } from "@/components/ui/Card";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadSummaryData(shiftId);

  if (!data.shift) notFound();

  if (data.shift.status !== "finalized" || !data.tipPoolCalculation) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-2">Summary Report</h1>
        <p className="text-sm text-[var(--ink-500)] mb-4">
          This shift ({data.shift.date}, {data.shift.period}) hasn&apos;t been saved &amp; finalized yet.
        </p>
        <Link href={`/shifts/${shiftId}/closing-report`} className="text-[var(--primary)] font-medium hover:underline">
          Go to Closing Report →
        </Link>
      </main>
    );
  }

  const totalPayout = data.payouts.reduce((a, p) => a + p.totalCorePayout, 0);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <p className="text-sm mb-2">
        <Link href="/shifts" className="text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          ← All shifts
        </Link>
      </p>
      <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-1.5">
        Summary Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-[var(--ink-500)] mb-8">
        Finalized {data.shift.finalizedAt ? new Date(data.shift.finalizedAt).toLocaleString() : ""} — figures below are a
        locked snapshot, not recalculated live.
      </p>

      <section className="mb-8 grid sm:grid-cols-3 gap-3">
        <StatCard label="Total sales" value={data.sales?.totalSales ?? 0} />
        <StatCard label="CC tip total" value={data.tipPoolCalculation.grossCcTip} />
        <StatCard label="Cash sales" value={data.sales?.cashSales ?? 0} />
      </section>

      <Section title="Tip pools">
        <Card>
          <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5 max-w-md">
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
                  label="Pool 2 (takeout + platform-courier)"
                  value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool2 ?? 0).toFixed(2)}`}
                />
                <Row label="Pool 3 (delivery, equal split)" value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool3 ?? 0).toFixed(2)}`} />
              </>
            )}
          </dl>
        </Card>
      </Section>

      <Section title="Payout by employee">
        <div className="sm:hidden space-y-2">
          {data.payouts.map((p) => (
            <Card key={p.employeeId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--ink-900)]">{p.employeeName}</div>
                  <div className="text-xs text-[var(--ink-500)]">
                    {p.positionName}
                    {p.pointValueUsed ? ` · ${p.pointValueUsed} pt` : ""}
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
          <Card className="p-4 bg-[var(--paper)]">
            <div className="flex items-center justify-between font-semibold text-[var(--ink-900)]">
              <span>Total</span>
              <span className="tabular-nums">${totalPayout.toFixed(2)}</span>
            </div>
          </Card>
        </div>

        <table className="hidden sm:table w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
              <th className="py-2 font-medium">Employee</th>
              <th className="py-2 font-medium">Position</th>
              <th className="py-2 text-right font-medium">Point value</th>
              <th className="py-2 text-right font-medium" title="Pool 1 — dine-in">Pool 1</th>
              <th className="py-2 text-right font-medium" title="Pool 2 — takeout/online">Pool 2</th>
              <th className="py-2 text-right font-medium" title="Pool 3 — delivery">Pool 3</th>
              <th className="py-2 text-right font-medium">Drink bonus</th>
              <th className="py-2 text-right font-medium">Total tip</th>
              <th className="py-2 text-right font-medium">Flat wage</th>
              <th className="py-2 text-right font-medium">Extra pay</th>
              <th className="py-2 text-right font-medium">Incentive</th>
              <th className="py-2 text-right font-medium">Deduction</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.payouts.map((p) => (
              <tr key={p.employeeId} className="border-b border-[var(--border)]">
                <td className="py-2 text-[var(--ink-900)]">{p.employeeName}</td>
                <td className="py-2 text-[var(--ink-500)]">{p.positionName}</td>
                <td className="py-2 text-right tabular-nums">{p.pointValueUsed ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{p.pool1Share > 0 ? `$${p.pool1Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{p.pool2Share > 0 ? `$${p.pool2Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{p.pool3Share > 0 ? `$${p.pool3Share.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{p.hostUpsellTipShare > 0 ? `$${p.hostUpsellTipShare.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums font-medium">${p.totalTip.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${p.flatWageAmount.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">{p.extraPayAmount > 0 ? `$${p.extraPayAmount.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums">{p.incentiveAmount > 0 ? `$${p.incentiveAmount.toFixed(2)}` : "—"}</td>
                <td className="py-2 text-right tabular-nums text-[var(--danger)]">
                  {p.deductionAmount > 0 ? `-$${p.deductionAmount.toFixed(2)}` : "—"}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">${p.totalCorePayout.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border-strong)] font-semibold">
              <td className="py-2.5">Total</td>
              <td colSpan={10}></td>
              <td className="py-2.5 text-right tabular-nums">${totalPayout.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-[var(--ink-500)] mt-3">
          Incentive column reflects any fired Incentive Rules (2026-08-10) — currently scoped to flat-rate, per-shift,
          category-targeted rules (e.g. the $10k-total-sales BOH bonus). Manager/Floor Manager weekly commission still needs
          per-employee weighting and WEEK-period evaluation, not built yet.
        </p>
      </Section>
    </main>
  );
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
