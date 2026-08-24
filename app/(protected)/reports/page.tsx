import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";
import { loadPettyCashReport } from "@/lib/reports/loadPettyCashReport";
import { loadSupplierCheckReport } from "@/lib/reports/loadSupplierCheckReport";
import { PettyCashReportTable } from "./PettyCashReportTable";
import { SupplierCheckReportTable } from "./SupplierCheckReportTable";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { formatDayLabel } from "@/lib/format/formatDayLabel";
import {
  PageHeader,
  Card,
  Section,
  Button,
  LinkButton,
  DownloadLinkButton,
  EmptyState,
  Tabs,
  Tab,
  DayLabel,
  TableCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TFoot,
  StackedCardList,
  StackedCard,
  StackedField,
} from "@/components/ui";

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
  const requestedReport: ReportType =
    params.report === "petty-cash" ? "petty-cash" : params.report === "supplier-check" ? "supplier-check" : "sales-tax";

  // Permission System Phase C (2026-08-21), from the scrutinize pass:
  // two of the three report types on this page ARE the Ledger data that
  // VIEW_LEDGER_OVERVIEW now gates -- the Petty Cash report is the same
  // loader /ledger uses, and the Supplier Check report is the same data
  // as /ledger/supplier-check. Gating /ledger while leaving these open
  // would have made the new guard decorative: the same numbers were one
  // tab away. Sales & tax stays open to any manager (it is shift/POS
  // data, not Ledger data, and has no capability of its own).
  const viewer = await getViewerCapabilities();
  const canSeeLedgerReports = viewer?.has("VIEW_LEDGER_OVERVIEW") ?? false;
  if ((requestedReport === "petty-cash" || requestedReport === "supplier-check") && !canSeeLedgerReports) {
    return <NoAccess pageLabel="that report" />;
  }
  const report = requestedReport;

  const data = report === "sales-tax" ? await loadSalesTaxReport(from, to) : null;
  const pettyCashData = report === "petty-cash" ? await loadPettyCashReport(from, to) : null;
  const supplierCheckData = report === "supplier-check" ? await loadSupplierCheckReport(from, to) : null;
  const exportHref =
    report === "supplier-check"
      ? `/reports/export-supplier-check?from=${from}&to=${to}`
      : `/reports/export?from=${from}&to=${to}`;

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      <PageHeader
        title="Reports"
        description={
          report === "sales-tax"
            ? "Rolled up from finalized shifts — matches the layout of the monthly report you already send to your accountant. Only counts shifts that have been Confirmed & Finalized."
            : report === "petty-cash"
              ? "Petty Cash by day for the range below — click a date to open that day's actual entries and reconciliation."
              : "Checks written to suppliers for the range below — export as .xlsx to print payment checks, columns match the supplier check export you already use."
        }
      />

      <Tabs>
        <Tab href={`/reports?report=sales-tax&from=${from}&to=${to}`} active={report === "sales-tax"}>
          Sales &amp; Tax
        </Tab>
        {/* Hidden rather than shown-and-denied: a tab that always lands
            on a no-access notice is the dead-end pattern, same reasoning
            as the hidden nav items and home tiles. */}
        {canSeeLedgerReports && (
          <>
            <Tab href={`/reports?report=petty-cash&from=${from}&to=${to}`} active={report === "petty-cash"}>
              Petty Cash
            </Tab>
            <Tab href={`/reports?report=supplier-check&from=${from}&to=${to}`} active={report === "supplier-check"}>
              Supplier Check
            </Tab>
          </>
        )}
      </Tabs>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`/reports?report=${report}&from=${presets.week.from}&to=${presets.week.to}`}
              variant="secondary"
              size="sm"
            >
              This week
            </LinkButton>
            <LinkButton
              href={`/reports?report=${report}&from=${presets.month.from}&to=${presets.month.to}`}
              variant="secondary"
              size="sm"
            >
              This month
            </LinkButton>
            <LinkButton
              href={`/reports?report=${report}&from=${presets.year.from}&to=${presets.year.to}`}
              variant="secondary"
              size="sm"
            >
              This year
            </LinkButton>
          </div>
          <form className="flex flex-wrap items-end gap-2" action="/reports">
            <input type="hidden" name="report" value={report} />
            <label className="text-sm">
              <span className="block text-[var(--ink-500)] mb-1.5">From</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="border border-[var(--border-strong)] rounded-[var(--radius-md)] px-3 py-2.5 min-h-11 text-base bg-[var(--card)] text-[var(--ink-900)]"
              />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--ink-500)] mb-1.5">To</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="border border-[var(--border-strong)] rounded-[var(--radius-md)] px-3 py-2.5 min-h-11 text-base bg-[var(--card)] text-[var(--ink-900)]"
              />
            </label>
            <Button type="submit" size="sm">
              View
            </Button>
          </form>
          {/* Export is a plain <a> (DownloadLinkButton), deliberately not
              LinkButton: next/link prefetches, and prefetching a download
              route fires it without its required from/to params -> a 400 on
              every page view. See DownloadLinkButton's doc comment. */}
          {(report === "sales-tax" || report === "supplier-check") && (
            <DownloadLinkButton href={exportHref} variant="brand" size="sm" className="sm:ml-auto">
              Export .xlsx
            </DownloadLinkButton>
          )}
        </div>
      </Card>

      {/* Prose, deliberately NOT DayLabel: a fixed-width weekday box opens
          a visible gap mid-sentence. There is no column to align to here. */}
      <p className="text-sm text-[var(--ink-500)] mb-3">
        {formatDayLabel(from)} to {formatDayLabel(to)}
      </p>

      {report === "petty-cash" && pettyCashData ? (
        <PettyCashReportTable data={pettyCashData} />
      ) : report === "supplier-check" && supplierCheckData ? (
        <SupplierCheckReportTable data={supplierCheckData} />
      ) : data ? (
        <>
          <Section title="Toast — by day">
            {data.toastDays.length === 0 ? (
              <EmptyState message="No finalized shifts in this range." />
            ) : (
              <>
                {/* Phone: stacked cards. Eight numeric columns cannot be read
                    at 390px as a table — the amount column ends up clipped
                    off-screen, the exact anti-pattern the Analytics P&L fix
                    had to undo. Total Sale leads as the trailing value since
                    it is the number a manager scans for. */}
                <StackedCardList>
                  {data.toastDays.map((d) => (
                    <StackedCard
                      key={d.date}
                      title={<DayLabel iso={d.date} />}
                      trailing={
                        <span className="tabular-nums font-semibold text-[var(--ink-900)]">
                          {formatMoney(d.totalSale)}
                        </span>
                      }
                    >
                      <StackedField label="Net Sale" value={formatMoney(d.netSale)} numeric />
                      <StackedField label="Tax" value={formatMoney(d.tax)} numeric />
                      <StackedField label="Cash" value={formatMoney(d.cash)} numeric />
                      <StackedField label="CC Sales" value={formatMoney(d.ccSalesOnly)} numeric />
                      <StackedField label="CC Tips" value={formatMoney(d.ccTips)} numeric />
                      <StackedField label="Total Credit" value={formatMoney(d.totalCredit)} numeric />
                    </StackedCard>
                  ))}
                  <div className="bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-lg)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-semibold text-[var(--ink-900)]">Total</span>
                      <span className="font-semibold tabular-nums text-[var(--ink-900)]">
                        {formatMoney(data.toastTotals.totalSale)}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <StackedField label="Net Sale" value={formatMoney(data.toastTotals.netSale)} numeric />
                      <StackedField label="Tax" value={formatMoney(data.toastTotals.tax)} numeric />
                      <StackedField label="Cash" value={formatMoney(data.toastTotals.cash)} numeric />
                      <StackedField label="CC Sales" value={formatMoney(data.toastTotals.ccSalesOnly)} numeric />
                      <StackedField label="CC Tips" value={formatMoney(data.toastTotals.ccTips)} numeric />
                      <StackedField
                        label="Total Credit"
                        value={formatMoney(data.toastTotals.totalCredit)}
                        numeric
                      />
                    </div>
                  </div>
                </StackedCardList>

                {/* Desktop: table */}
                <TableCard>
                  <Table minWidth={860}>
                    <THead>
                      <TR>
                        <TH>Date</TH>
                        <TH numeric>Net Sale</TH>
                        <TH numeric>Tax</TH>
                        <TH numeric emphasis>
                          Total Sale
                        </TH>
                        <TH numeric>Cash</TH>
                        <TH numeric>CC Sales</TH>
                        <TH numeric>CC Tips</TH>
                        <TH numeric>Total Credit</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.toastDays.map((d) => (
                        <TR key={d.date}>
                          <TD emphasis className="whitespace-nowrap">
                            <DayLabel iso={d.date} />
                          </TD>
                          <TD numeric>{formatMoney(d.netSale)}</TD>
                          <TD numeric>{formatMoney(d.tax)}</TD>
                          <TD numeric emphasis>
                            {formatMoney(d.totalSale)}
                          </TD>
                          <TD numeric>{formatMoney(d.cash)}</TD>
                          <TD numeric>{formatMoney(d.ccSalesOnly)}</TD>
                          <TD numeric>{formatMoney(d.ccTips)}</TD>
                          <TD numeric>{formatMoney(d.totalCredit)}</TD>
                        </TR>
                      ))}
                    </TBody>
                    <TFoot>
                      <TD emphasis>Total</TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.netSale)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.tax)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.totalSale)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.cash)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.ccSalesOnly)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.ccTips)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.toastTotals.totalCredit)}
                      </TD>
                    </TFoot>
                  </Table>
                </TableCard>
              </>
            )}
          </Section>

          <Section title="Online platforms — totals for range">
            {data.platformTotals.every((p) => p.net === 0) ? (
              <EmptyState message="No online platform sales in this range." />
            ) : (
              <>
                <StackedCardList>
                  {data.platformTotals.map((p) => (
                    <StackedCard
                      key={p.platformId}
                      title={p.platformName}
                      trailing={
                        <span className="tabular-nums font-semibold text-[var(--ink-900)]">
                          {formatMoney(p.total)}
                        </span>
                      }
                    >
                      <StackedField label="Net" value={formatMoney(p.net)} numeric />
                      <StackedField label="Tax" value={formatMoney(p.tax)} numeric />
                      <StackedField label="Tips" value={formatMoney(p.tips)} numeric />
                    </StackedCard>
                  ))}
                  <div className="bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-lg)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-semibold text-[var(--ink-900)]">Total online</span>
                      <span className="font-semibold tabular-nums text-[var(--ink-900)]">
                        {formatMoney(data.onlineTotals.total)}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <StackedField label="Net" value={formatMoney(data.onlineTotals.net)} numeric />
                      <StackedField label="Tax" value={formatMoney(data.onlineTotals.tax)} numeric />
                      <StackedField label="Tips" value={formatMoney(data.onlineTotals.tips)} numeric />
                    </div>
                  </div>
                </StackedCardList>

                <TableCard className="max-w-xl">
                  <Table minWidth={480}>
                    <THead>
                      <TR>
                        <TH>Platform</TH>
                        <TH numeric>Net</TH>
                        <TH numeric>Tax</TH>
                        <TH numeric>Tips</TH>
                        <TH numeric emphasis>
                          Total
                        </TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.platformTotals.map((p) => (
                        <TR key={p.platformId}>
                          <TD emphasis>{p.platformName}</TD>
                          <TD numeric>{formatMoney(p.net)}</TD>
                          <TD numeric>{formatMoney(p.tax)}</TD>
                          <TD numeric>{formatMoney(p.tips)}</TD>
                          <TD numeric emphasis>
                            {formatMoney(p.total)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                    <TFoot>
                      <TD emphasis>Total online</TD>
                      <TD numeric emphasis>
                        {formatMoney(data.onlineTotals.net)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.onlineTotals.tax)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.onlineTotals.tips)}
                      </TD>
                      <TD numeric emphasis>
                        {formatMoney(data.onlineTotals.total)}
                      </TD>
                    </TFoot>
                  </Table>
                </TableCard>
              </>
            )}
            <p className="text-xs text-[var(--ink-500)] mt-4">
              The exported .xlsx breaks online platform sales down by day (matching your
              accountant&apos;s usual monthly report) — this page shows range totals only, to keep
              it readable at a glance.
            </p>
          </Section>
        </>
      ) : null}
    </main>
  );
}
