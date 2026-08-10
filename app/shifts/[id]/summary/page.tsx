import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSummaryData } from "@/lib/shift/loadSummaryData";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadSummaryData(shiftId);

  if (!data.shift) notFound();

  if (data.shift.status !== "finalized" || !data.tipPoolCalculation) {
    return (
      <main className="max-w-2xl mx-auto p-8 font-sans">
        <h1 className="text-2xl font-semibold mb-2">Summary Report</h1>
        <p className="text-sm text-neutral-500 mb-4">
          This shift ({data.shift.date}, {data.shift.period}) hasn&apos;t been saved &amp; finalized yet.
        </p>
        <Link href={`/shifts/${shiftId}/closing-report`} className="underline text-blue-600">
          Go to Closing Report →
        </Link>
      </main>
    );
  }

  const totalPayout = data.payouts.reduce((a, p) => a + p.totalCorePayout, 0);

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/shifts" className="text-neutral-500 hover:underline">← All shifts</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Summary Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-8">
        Finalized {data.shift.finalizedAt ? new Date(data.shift.finalizedAt).toLocaleString() : ""} — figures below are a
        locked snapshot, not recalculated live.
      </p>

      <section className="mb-8 grid sm:grid-cols-3 gap-4">
        <StatCard label="Total sales" value={data.sales?.totalSales ?? 0} />
        <StatCard label="CC tip total" value={data.tipPoolCalculation.grossCcTip} />
        <StatCard label="Cash sales" value={data.sales?.cashSales ?? 0} />
      </section>

      <section className="mb-8 border rounded p-4">
        <h2 className="text-lg font-medium mb-3">Tip pools</h2>
        <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 max-w-md">
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
              <Row label="Pool 2 (takeout + platform-courier)" value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool2 ?? 0).toFixed(2)}`} />
              <Row label="Pool 3 (delivery, equal split)" value={`$${(data.tipPoolCalculation.perRoleBreakdown.pool3 ?? 0).toFixed(2)}`} />
            </>
          )}
        </dl>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Payout by employee</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-1.5">Employee</th>
              <th className="py-1.5 text-right">Point value</th>
              <th className="py-1.5 text-right" title="Pool 1 — dine-in">Pool 1</th>
              <th className="py-1.5 text-right" title="Pool 2 — takeout/online">Pool 2</th>
              <th className="py-1.5 text-right" title="Pool 3 — delivery">Pool 3</th>
              <th className="py-1.5 text-right">Drink bonus</th>
              <th className="py-1.5 text-right font-medium">Total tip</th>
              <th className="py-1.5 text-right">Flat wage</th>
              <th className="py-1.5 text-right">Extra pay</th>
              <th className="py-1.5 text-right">Incentive</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.payouts.map((p) => (
              <tr key={p.employeeId} className="border-b">
                <td className="py-1.5">{p.employeeName}</td>
                <td className="py-1.5 text-right tabular-nums">{p.pointValueUsed ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{p.pool1Share > 0 ? `$${p.pool1Share.toFixed(2)}` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{p.pool2Share > 0 ? `$${p.pool2Share.toFixed(2)}` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{p.pool3Share > 0 ? `$${p.pool3Share.toFixed(2)}` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {p.hostUpsellTipShare > 0 ? `$${p.hostUpsellTipShare.toFixed(2)}` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium">${p.totalTip.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums">${p.flatWageAmount.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {p.extraPayAmount > 0 ? `$${p.extraPayAmount.toFixed(2)}` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {p.incentiveAmount > 0 ? `$${p.incentiveAmount.toFixed(2)}` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium">${p.totalCorePayout.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-2">Total</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td className="py-2 text-right tabular-nums">${totalPayout.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-neutral-500 mt-2">
          Incentive column reflects any fired Incentive Rules (2026-08-10) — currently scoped to
          flat-rate, per-shift, category-targeted rules (e.g. the $10k-total-sales BOH bonus).
          Manager/Floor Manager weekly commission still needs per-employee weighting and WEEK-period
          evaluation, not built yet.
        </p>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-4">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums">${value.toFixed(2)}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
