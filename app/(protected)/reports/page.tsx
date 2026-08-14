import Link from "next/link";
import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";
import { loadPettyCashReport } from "@/lib/reports/loadPettyCashReport";
import { loadSupplierCheckReport } from "@/lib/reports/loadSupplierCheckReport";
import { PettyCashReportTable } from "./PettyCashReportTable";
import { SupplierCheckReportTable } from "./SupplierCheckReportTable";

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

type ReportType = "sales-tax" | "petty-cash" | "supplier-check";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; report?: string }>;
}) {
  const params = await searchParams;
  const today = parseDate(toIso(new Date()));
  const presets = computePresets(today);

  const from = params.from || presets.month.from;
  const to = params.to || presets.month.to;
  // Kept as a query param (not a separate route) specifically so the
  // date-range picker/presets below stay shared between report types —
  // Oliver's own instruction: "we already got report page, we should
  // utilize that page to show different report" rather than building a
  // second calendar UI under /ledger for the Petty Cash week/month view
  // (and, 2026-08-14, the Supplier Check range view).
  const report: ReportType =
    params.report === "petty-cash" ? "petty-cash" : params.report === "supplier-check" ? "supplier-check" : "sales-tax";

  const data = report === "sales-tax" ? await loadSalesTaxReport(from, to) : null;
  const pettyCashData = report === "petty-cash" ? await loadPettyCashReport(from, to) : null;
  const supplierCheckData = report === "supplier-check" ? await loadSupplierCheckReport(from, to) : null;
  const exportHref =
    report === "supplier-check"
      ? `/reports/export-supplier-check?from=${from}&to=${to}`
      : `/reports/export?from=${from}&to=${to}`;

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Reports</h1>
      <p className="text-sm text-neutral-500 mb-4">
        {report === "sales-tax"
          ? "Rolled up from finalized shifts — matches the layout of the monthly report you already send to your accountant. Only counts shifts that have been Confirmed & Finalized."
          : report === "petty-cash"
            ? "Petty Cash by day for the range below — click a date to open that day's actual entries and reconciliation."
            : "Checks written to suppliers for the range below — export as .xlsx to print payment checks, columns match the supplier check export you already use."}
      </p>

      <div className="flex items-center gap-2 text-sm mb-4">
        <ReportTabLink report="sales-tax" current={report} from={from} to={to}>
          Sales &amp; Tax
        </ReportTabLink>
        <ReportTabLink report="petty-cash" current={report} from={from} to={to}>
          Petty Cash
        </ReportTabLink>
        <ReportTabLink report="supplier-check" current={report} from={from} to={to}>
          Supplier Check
        </ReportTabLink>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6 border rounded p-4 bg-neutral-50">
        <div className="flex gap-2">
          <PresetLink href={`/reports?report=${report}&from=${presets.week.from}&to=${presets.week.to}`}>This week</PresetLink>
          <PresetLink href={`/reports?report=${report}&from=${presets.month.from}&to=${presets.month.to}`}>This month</PresetLink>
          <PresetLink href={`/reports?report=${report}&from=${presets.year.from}&to=${presets.year.to}`}>This year</PresetLink>
        </div>
        <form className="flex items-end gap-2 text-sm" action="/reports">
          <input type="hidden" name="report" value={report} />
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
        {(report === "sales-tax" || report === "supplier-check") && (
          <a
            href={exportHref}
            className="ml-auto px-4 py-1.5 rounded bg-green-700 text-white text-sm hover:bg-green-800"
          >
            Export .xlsx
          </a>
        )}
      </div>

      <p className="text-sm text-neutral-500 mb-2">
        {from} to {to}
      </p>

      {report === "petty-cash" && pettyCashData ? (
        <PettyCashReportTable data={pettyCashData} />
      ) : report === "supplier-check" && supplierCheckData ? (
        <SupplierCheckReportTable data={supplierCheckData} />
      ) : data ? (
        <>
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
                <td className="py-2 text-right tabular-nums font-medium">${data.onlineTotals.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="text-xs text-neutral-500 mt-4">
          The exported .xlsx breaks online platform sales down by day (matching your accountant&apos;s
          usual monthly report) — this page shows range totals only, to keep it readable at a glance.
        </p>
      </section>
      </>
      ) : null}
    </main>
  );
}

function PresetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-100"
    >
      {children}
    </Link>
  );
}

function ReportTabLink({
  report,
  current,
  from,
  to,
  children,
}: {
  report: string;
  current: string;
  from: string;
  to: string;
  children: React.ReactNode;
}) {
  const active = report === current;
  return (
    <Link
      href={`/reports?report=${report}&from=${from}&to=${to}`}
      className={
        "px-3 py-1.5 rounded border " +
        (active ? "bg-black text-white border-black" : "text-neutral-600 hover:bg-neutral-50")
      }
    >
      {children}
    </Link>
  );
}
