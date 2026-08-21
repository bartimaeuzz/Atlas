import Link from "next/link";
import { loadPettyCashReport } from "@/lib/reports/loadPettyCashReport";
import { LedgerTabs } from "./LedgerTabs";
import { MonthList } from "./MonthList";
import { PageHeader } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** Ledger landing page (2026-08-14 restructure) -- Oliver's ask: "after
 * enter ledger page shows petty cash and supplier tabs. then when click
 * petty cash show list of date in month first. then you can click each
 * day to work on." This page IS the Petty Cash tab (a month calendar of
 * days); Supplier lives at /ledger/supplier-check. Clicking a day here
 * goes to /ledger/day?date=... , which holds the actual entry/
 * reconciliation work that used to live directly on this page. */

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 12));
  const end = new Date(Date.UTC(y, m, 0, 12)); // day 0 of next month = last day of this one
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

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  // Permission System Phase C view guard (2026-08-21). VIEW_LEDGER_OVERVIEW
  // gates the Ledger *pages*; what you can actually enter or change once
  // inside stays governed by PETTY_CASH_EDIT / SUPPLIER_CHECK_LOG on the
  // server actions themselves (Phase B). Deliberately scoped this way --
  // gating the whole Ledger area behind this key would make it a
  // prerequisite for those two rather than a real permission, since
  // nobody can enter petty cash on a page they can't open. The
  // vendors/categories/cards admin pages are likewise NOT gated here:
  // they're shared reference data, same call as leaving them on
  // requireManagerAction() in Phase B.
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_LEDGER_OVERVIEW")) return <NoAccess pageLabel="the Ledger" />;
  const showCard = viewer.has("VIEW_LEDGER_CARD_REPORT");

  const params = await searchParams;
  const todayIso = toIso(new Date());
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : todayIso.slice(0, 7);
  const { start, end } = monthBounds(month);
  const data = await loadPettyCashReport(start, end);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <PageHeader title="Ledger" description="Pick a day below to log petty cash or review its reconciliation." />

      <LedgerTabs active="petty-cash" showOverview showCard={showCard} />

      <div className="flex items-center justify-between mb-3">
        <Link href={`/ledger?month=${shiftMonth(month, -1)}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          &larr; Prev
        </Link>
        <span className="font-medium text-sm text-[var(--ink-900)]">{monthLabel(month)}</span>
        <Link href={`/ledger?month=${shiftMonth(month, 1)}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          Next &rarr;
        </Link>
      </div>

      <MonthList data={data} todayIso={todayIso} />
    </main>
  );
}
