import Link from "next/link";
import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";

/** Pinned to UTC noon, same fix as MyEarningsView.tsx — avoids the classic
 * "YYYY-MM-DD parses as the previous day" bug in negative-UTC-offset
 * timezones. */
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = parseDate(toIso(new Date()));
  const presets = computePresets(today);

  const from = params.from || presets.month.from;
  const to = params.to || presets.month.to;

  const data = await loadSalesTaxReport(from, to);
  const exportHref = `/reports/export?from=${from}&to=${to}`;

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Sales &amp; Tax Report</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Rolled up from finalized shifts — matches the layout of the monthly report you already send
        to your accountant. Only counts shifts that have been Confirmed &amp; Finalized.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-6 border rounded p-4 bg-neutral-50">
        <div className="flex gap-2">
          <PresetLink href={`/reports?from=${presets.week.from}&to=${presets.week.to}`}>This week</PresetLink>
          <PresetLink href={`/reports?from=${presets.month.from}&to=${presets.month.to}`}>This month</PresetLink>
          <PresetLink href={`/reports?from=${presets.year.from}&to=${presets.year.to}`}>This year</PresetLink>
        </div>
        <form className="flex items-end gap-2 text-sm" action="/reports">
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
        <a
          href={exportHref}
          className="ml-auto px-4 py-1.5 rounded bg-green-700 text-white text-sm hover:bg-green-800"
        >
          Export .xlsx
        </a>
      </div>

      <p className="text-sm text-neutral-500 mb-2">
        {from} to {to}
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Toast — by day</h2>
        {data.toastDays.length === 0 ? (
          <p className="text-sm text-neutral-500">No finalized shifts in this range.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1.5">Date</th>
                <th className="py-1.5 text-right">Net Sale</th>
                <th className="py-1.5 text-right">Tax</th>
                <th className="py-1.5 text-right font-medium">Total Sale</th>
                <th className="py-1.5 text-right">Cash</th>
                <th className="py-1.5 text-right">CC Sales</th>
                <th className="py-1.5 text-right">CC Tips</th>
                <th className="py-1.5 text-right">Total Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.toastDays.map((d) => (
                <tr key={d.date} className="border-b">
                  <td className="py-1.5">{d.date}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.netSale.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.tax.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">${d.totalSale.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.cash.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.ccSalesOnly.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.ccTips.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${d.totalCredit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-medium">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.netSale.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.tax.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.totalSale.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.cash.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.ccSalesOnly.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.ccTips.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.toastTotals.totalCredit.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Online platforms — totals for range</h2>
        {data.platformTotals.every((p) => p.net === 0) ? (
          <p className="text-sm text-neutral-500">No online platform sales in this range.</p>
        ) : (
          <table className="w-full text-sm border-collapse max-w-xl">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1.5">Platform</th>
                <th className="py-1.5 text-right">Net</th>
                <th className="py-1.5 text-right">Tax</th>
                <th className="py-1.5 text-right">Tips</th>
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.platformTotals.map((p) => (
                <tr key={p.platformId} className="border-b">
                  <td className="py-1.5">{p.platformName}</td>
                  <td className="py-1.5 text-right tabular-nums">${p.net.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${p.tax.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums">${p.tips.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">${p.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-medium">
                <td className="py-2">Total online</td>
                <td className="py-2 text-right tabular-nums">${data.onlineTotals.net.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.onlineTotals.tax.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.onlineTotals.tips.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">${data.onlineTotals.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="text-xs text-neutral-500 mt-4">
          The exported .xlsx breaks online platform sales down by day (matching your accountant&apos;s
          usual monthly report) — this page shows range totals only, to keep it readable at a glance.
        </p>
      </section>
    </main>
  );
}

function PresetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded border text-sm hover:bg-neutral-100">
      {children}
    </Link>
  );
}
