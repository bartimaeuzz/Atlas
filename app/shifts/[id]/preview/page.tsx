import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { shifts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeFinalizationPreview } from "@/lib/shift/computeFinalizationPreview";
import { ConfirmFinalizeButton } from "./ConfirmFinalizeButton";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);

  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) notFound();
  // Already locked — nothing to preview, the real thing is more useful.
  if (shift.status === "finalized") redirect(`/shifts/${shiftId}/summary`);

  let preview: Awaited<ReturnType<typeof computeFinalizationPreview>> | null = null;
  let error: string | null = null;
  try {
    preview = await computeFinalizationPreview(shiftId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href={`/shifts/${shiftId}/closing-report`} className="text-neutral-500 hover:underline">
          ← Back to Closing Report
        </Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Preview — {shift.date} ({shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-8">
        Nothing is saved yet. These numbers are computed live from the current roster and closing
        report — go back and change anything, then come back here to see it update before you
        finalize.
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line mb-6">
          <div className="font-medium mb-1">Can&apos;t compute a preview yet</div>
          {error}
        </div>
      )}

      {preview && (
        <>
          <section className="mb-8 grid sm:grid-cols-3 gap-4">
            <StatCard label="Total sales" value={preview.sales.totalSales} />
            <StatCard label="CC tip total" value={preview.sales.ccTipTotal} />
            <StatCard label="Cash sales" value={preview.sales.cashSales} />
          </section>

          <section className="mb-8 border rounded p-4">
            <h2 className="text-lg font-medium mb-3">Tip pools</h2>
            <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 max-w-md">
              <Row label="Deduction rate" value={`${(preview.result.tipPoolCalculation.deductionRate * 100).toFixed(1)}%`} />
              <Row label="Net CC tip (after deduction)" value={`$${preview.result.tipPoolCalculation.netCcTip.toFixed(2)}`} />
              {preview.result.tipPoolCalculation.totalHostUpsellTip > 0 && (
                <Row
                  label="Host drink bonus (pulled off Pool 1 top)"
                  value={`$${preview.result.tipPoolCalculation.totalHostUpsellTip.toFixed(2)}`}
                />
              )}
              <Row label="Pool 1 (dine-in)" value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool1 ?? 0).toFixed(2)}`} />
              <Row label="Pool 2 (takeout + platform-courier)" value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool2 ?? 0).toFixed(2)}`} />
              <Row label="Pool 3 (delivery)" value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool3 ?? 0).toFixed(2)}`} />
            </dl>
          </section>

          <section className="mb-8">
            <h2 className="text-lg font-medium mb-3">Payout by employee</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-neutral-500 border-b">
                  <th className="py-1.5">Employee</th>
                  <th className="py-1.5 text-right">Point value</th>
                  <th className="py-1.5 text-right">Tip pool share</th>
                  <th className="py-1.5 text-right">Drink bonus</th>
                  <th className="py-1.5 text-right">Flat wage</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {preview.result.employeePayouts.map((p) => (
                  <tr key={p.employeeId} className="border-b">
                    <td className="py-1.5">{preview!.employeeNames[p.employeeId] ?? `#${p.employeeId}`}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.pointValueUsed ?? "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">${p.tipPoolShare.toFixed(2)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {p.hostUpsellTipShare > 0 ? `$${p.hostUpsellTipShare.toFixed(2)}` : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">${p.flatWageAmount.toFixed(2)}</td>
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
                  <td className="py-2 text-right tabular-nums">
                    ${preview.result.employeePayouts.reduce((a, p) => a + p.totalCorePayout, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="border-t pt-6">
            <p className="text-sm text-neutral-500 mb-3">
              Numbers look right? Finalizing locks this shift — the roster and closing report can&apos;t
              be edited afterward.
            </p>
            <ConfirmFinalizeButton shiftId={shiftId} />
          </section>
        </>
      )}
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
