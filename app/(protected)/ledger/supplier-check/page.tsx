import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadPendingInvoicesByVendor, loadSupplierChecks } from "@/lib/ledger/loadSupplierCheck";
import { toIso, weekStartFor, datesInWeek, shiftWeek } from "@/lib/schedule/weekMath";
import { LedgerTabs } from "../LedgerTabs";
import { PendingByVendor } from "./PendingByVendor";
import { ChecksTable } from "./ChecksTable";
import { PrintChecksButton } from "./PrintChecksButton";
import { PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Tab } from "@/components/ui/Tabs";
import { formatMoney } from "../formatMoney";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** Month helpers, same shape as /ledger/page.tsx's (kept local rather
 * than shared -- matches that file's own precedent of each page owning
 * its small date-math rather than a shared util). */
function monthBounds(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 12));
  const end = new Date(Date.UTC(y, m, 0, 12));
  return { start: toIso(start), end: toIso(end) };
}
function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function weekLabel(weekStart: string): string {
  const days = datesInWeek(weekStart);
  const start = new Date(`${days[0]}T12:00:00Z`);
  const end = new Date(`${days[6]}T12:00:00Z`);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${startStr} - ${endStr}`;
}

/** Supplier Check (2026-08-14, restructured twice same day after Oliver
 * talked to Aey about the real workflow, then flagged two more follow-
 * ups) -- invoice-based vendor payments, for suppliers who drop an
 * invoice at delivery and get paid later by check, as opposed to Petty
 * Cash's cash-on-delivery entries. See project_atlas_ledger memory for
 * the full design conversation.
 *
 * Real workflow, confirmed: "all invoices always get export to check
 * format at the end of the week" (the routine path) but some vendors
 * (e.g. maintenance) need a check right after service (the instant
 * path) -- both now go through ONE "Print Checks" popup where a manager
 * checks off exactly which vendors to print for right now, one/some/all
 * ("i want a flexibility to print some but not all or print all").
 * Printing always combines EVERY pending invoice for the chosen
 * vendor(s) into one check each ("same vendor always get combined
 * check"). Checks then move Printed -> Paid once actually delivered to
 * the supplier -- the holistic table below is every check ever printed,
 * not just paid ones, and every row (Printed or Paid) can be Reprinted
 * at any time, since clicking Print in the app isn't the same as it
 * actually coming out of a physical printer. */
export default async function SupplierCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string; month?: string }>;
}) {
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_LEDGER_OVERVIEW")) return <NoAccess pageLabel="Supplier Check" />;
  const showCard = viewer.has("VIEW_LEDGER_CARD_REPORT");

  const params = await searchParams;
  const todayIso = businessTodayIso();
  // Week/month picker (2026-08-16) -- Oliver: "supplier tab on ledger
  // should be able to show by week or month." Defaults to week since
  // that's the routine cadence ("all invoices always get export to
  // check format at the end of the week" -- see this file's header
  // comment); month is the zoom-out option, same two-view idea as
  // Schedule Planner's week/month views.
  const view: "week" | "month" = params.month && !params.week ? "month" : params.view === "month" ? "month" : "week";
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? weekStartFor(params.week!) : weekStartFor(todayIso);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : todayIso.slice(0, 7);

  const range =
    view === "week"
      ? { from: weekStart, to: datesInWeek(weekStart)[6] }
      : (() => {
          const b = monthBounds(month);
          return { from: b.start, to: b.end };
        })();

  const [pendingGroups, checks] = await Promise.all([
    loadPendingInvoicesByVendor(),
    loadSupplierChecks(range),
  ]);
  const periodTotal = checks.reduce((sum, c) => sum + c.totalAmount, 0);
  // Who can even attempt to edit an already Printed/Paid invoice --
  // 2026-08-15, see editSupplierInvoice's comment in
  // lib/actions/supplierCheck.ts for the full rule (this is just the
  // UI-visibility half; the server action re-checks independently).
  // Reads the capability since 2026-08-23, not systemRole plus the
  // isFinancialAuditor column -- same four accounts, one source of truth,
  // and /permissions now reflects it.
  const canEditLockedInvoices = viewer.has("FA_SUPPLIER_CHECK_EDIT_LOCKED");
  // Marking a printed check paid/delivered split off from log/print on
  // 2026-08-23 -- see lib/actions/supplierCheck.ts's header. Read through
  // the capability registry rather than a systemRole test so /permissions
  // and the button can't disagree; `viewer` is already loaded above and
  // getViewerCapabilities is React-cached, so this costs nothing extra.
  // The server action re-checks independently -- this is only the half
  // that decides what to render.
  const canMarkPaid = viewer.has("FA_SUPPLIER_CHECK_FINALIZE");

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <PageHeader title="Ledger" description="Invoice-based vendor payments, settled by check." />

      <LedgerTabs active="supplier" showOverview showCard={showCard} />

      <div className="flex items-center justify-between gap-3 mb-6">
        <LinkButton href="/ledger/supplier-check/new" size="sm">
          + Add item
        </LinkButton>
        <PrintChecksButton groups={pendingGroups} />
      </div>

      {pendingGroups.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-[var(--ink-700)] mb-2">Not yet checked</h2>
          <div className="space-y-4 mb-6">
            {pendingGroups.map((g) => (
              <PendingByVendor key={g.vendorId} group={g} />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-[var(--ink-700)]">Checks</h2>
        <div className="flex items-center gap-2 text-sm">
          <Tab href={`/ledger/supplier-check?view=week&week=${weekStart}`} active={view === "week"}>
            Week
          </Tab>
          <Tab href={`/ledger/supplier-check?view=month&month=${month}`} active={view === "month"}>
            Month
          </Tab>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <Link
          href={
            view === "week"
              ? `/ledger/supplier-check?view=week&week=${shiftWeek(weekStart, -1)}`
              : `/ledger/supplier-check?view=month&month=${shiftMonth(month, -1)}`
          }
          className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
        >
          &larr; Prev
        </Link>
        <span className="font-medium text-sm text-[var(--ink-900)]">{view === "week" ? weekLabel(weekStart) : monthLabel(month)}</span>
        <Link
          href={
            view === "week"
              ? `/ledger/supplier-check?view=week&week=${shiftWeek(weekStart, 1)}`
              : `/ledger/supplier-check?view=month&month=${shiftMonth(month, 1)}`
          }
          className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
        >
          Next &rarr;
        </Link>
      </div>

      <p className="text-sm text-[var(--ink-500)] mb-3">
        {checks.length === 0 ? "No checks in this period." : `${checks.length} check${checks.length === 1 ? "" : "s"} — ${formatMoney(periodTotal)} total`}
      </p>

      <ChecksTable checks={checks} canEditLockedInvoices={canEditLockedInvoices} canMarkPaid={canMarkPaid} />
    </main>
  );
}
