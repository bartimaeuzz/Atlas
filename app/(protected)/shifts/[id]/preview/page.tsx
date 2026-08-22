import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { shifts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeFinalizationPreview } from "@/lib/shift/computeFinalizationPreview";
import { sortPayoutsForDisplay } from "@/lib/shift/payoutSort";
import { ConfirmFinalizeButton } from "./ConfirmFinalizeButton";
import { Card, Section } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);

  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) notFound();
  if (shift.status === "finalized") redirect(`/shifts/${shiftId}/summary`);

  let preview: Awaited<ReturnType<typeof computeFinalizationPreview>> | null = null;
  let error: string | null = null;
  try {
    preview = await computeFinalizationPreview(shiftId);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <p className="text-sm mb-2">
        <Link href={`/shifts/${shiftId}/closing-report`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          ← Back to Closing Report
        </Link>
      </p>
      <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-1.5">
        Preview — {shift.date} ({shift.period})
      </h1>
      <p className="text-sm text-[var(--ink-500)] mb-8">
        Nothing is saved yet. These numbers are computed live from the current roster and closing report — go back and change
        anything, then come back here to see it update before you finalize.
      </p>

      {error && (
        <div className="mb-6">
          <Banner tone="danger" title="Can't compute a preview yet" description={error} />
        </div>
      )}

      {preview && (
        <>
          <section className="mb-8 grid sm:grid-cols-3 gap-3">
            <StatCard label="Total sales" value={preview.sales.totalSales} />
            <StatCard label="CC tip total" value={preview.sales.ccTipTotal} />
            <StatCard label="Cash sales" value={preview.sales.cashSales} />
          </section>

          <Section title="Tip pools">
            <Card>
              <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5 max-w-md">
                <Row label="Deduction rate" value={`${(preview.result.tipPoolCalculation.deductionRate * 100).toFixed(1)}%`} />
                <Row label="Net CC tip (after deduction)" value={`$${preview.result.tipPoolCalculation.netCcTip.toFixed(2)}`} />
                {preview.sales.cashTip > 0 && (
                  <Row label="Cash tip (added to Pool 1, no deduction)" value={`$${preview.sales.cashTip.toFixed(2)}`} />
                )}
                {preview.result.tipPoolCalculation.totalHostUpsellTip > 0 && (
                  <Row
                    label="Host drink bonus (pulled off Pool 1 top)"
                    value={`$${preview.result.tipPoolCalculation.totalHostUpsellTip.toFixed(2)}`}
                  />
                )}
                <Row label="Pool 1 (dine-in)" value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool1 ?? 0).toFixed(2)}`} />
                <Row
                  label="Pool 2 (takeout + platform-courier)"
                  value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool2 ?? 0).toFixed(2)}`}
                />
                <Row label="Pool 3 (delivery)" value={`$${(preview.result.tipPoolCalculation.perRoleBreakdown.pool3 ?? 0).toFixed(2)}`} />
              </dl>
            </Card>
          </Section>

          <Section title="Payout by employee">
            {/* Phone: stacked cards, one per employee — a 13-column table is
             * unreadable at phone width no matter how it's compressed.
             * Desktop: the full comparison table. */}
            <div className="lg:hidden space-y-2">
              {sortPayoutsForDisplay(preview.result.employeePayouts, preview.employeeNames, preview.positionByEmployeeId).map((p) => (
                <Card key={p.employeeId} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-semibold text-[var(--ink-900)]">
                        {preview!.employeeNames[p.employeeId] ?? `#${p.employeeId}`}
                      </div>
                      <div className="text-xs text-[var(--ink-500)]">
                        {preview!.positionByEmployeeId[p.employeeId]?.positionName ?? "—"}
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
                    {p.deductionAmount > 0 && (
                      <MiniRow label="Deduction" value={`-$${p.deductionAmount.toFixed(2)}`} tone="danger" />
                    )}
                  </dl>
                </Card>
              ))}
              <Card className="p-4 bg-[var(--paper)]">
                <div className="flex items-center justify-between font-semibold text-[var(--ink-900)]">
                  <span>Total</span>
                  <span className="tabular-nums">
                    ${preview.result.employeePayouts.reduce((a, p) => a + p.totalCorePayout, 0).toFixed(2)}
                  </span>
                </div>
              </Card>
            </div>

            <table className="hidden lg:table w-full text-sm border-collapse">
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
                {sortPayoutsForDisplay(preview.result.employeePayouts, preview.employeeNames, preview.positionByEmployeeId).map((p) => (
                  <tr key={p.employeeId} className="border-b border-[var(--border)]">
                    <td className="py-2 text-[var(--ink-900)]">{preview!.employeeNames[p.employeeId] ?? `#${p.employeeId}`}</td>
                    <td className="py-2 text-[var(--ink-500)]">{preview!.positionByEmployeeId[p.employeeId]?.positionName ?? "—"}</td>
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
                  <td className="py-2.5 text-right tabular-nums">
                    ${preview.result.employeePayouts.reduce((a, p) => a + p.totalCorePayout, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Section>

          <section className="border-t border-[var(--border)] pt-6">
            <p className="text-sm text-[var(--ink-500)] mb-3">
              Numbers look right? Finalizing locks this shift — the roster and closing report can&apos;t be edited afterward.
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
