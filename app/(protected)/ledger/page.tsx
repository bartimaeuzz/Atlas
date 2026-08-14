import Link from "next/link";
import { loadPettyCashDay } from "@/lib/ledger/loadPettyCashDay";
import { addDays, toIso } from "@/lib/schedule/weekMath";
import { AddEntryForm } from "./AddEntryForm";
import { EntriesList } from "./EntriesList";
import { ReconciliationPanel } from "./ReconciliationPanel";

/** Ledger v1 — Petty Cash (2026-08-14). Built from studying Soothr's real
 * " 2026 - C.xlsx" DNA file; see project_atlas_dna_petty_cash_expense
 * memory for the source study and PROGRESS.md for the design
 * conversation that shaped this (auto-pulled cash figures, the
 * finalize gate tied to that day's shifts, vendor/category admin).
 * Deliberately mobile-first: stacked cards and forms, not wide tables --
 * Oliver's own requirement, since a petty cash entry usually happens in
 * the moment on a phone, not at a desk. Supplier Check, receipt photos,
 * and the consolidated PDF/image report are later rounds — see
 * PROGRESS.md and the future-features-backlog memory. */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || toIso(new Date());
  const data = await loadPettyCashDay(date);
  const locked = data.status === "finalized";

  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">Petty Cash</h1>
        <span
          className={
            "text-xs px-2 py-1 rounded font-medium " +
            (locked ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600")
          }
        >
          {locked ? "Finalized" : "Draft"}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm mb-4">
        <Link href={`/ledger?date=${prevDate}`} className="text-neutral-500 hover:text-black underline">
          &larr;
        </Link>
        <span className="font-medium">{date}</span>
        <Link href={`/ledger?date=${nextDate}`} className="text-neutral-500 hover:text-black underline">
          &rarr;
        </Link>
      </div>

      <div className="flex items-center gap-4 text-xs mb-6">
        <Link href="/ledger/vendors" className="text-neutral-500 hover:text-black underline">
          Vendors
        </Link>
        <Link href="/ledger/categories" className="text-neutral-500 hover:text-black underline">
          Categories
        </Link>
      </div>

      {!locked && <AddEntryForm key={data.entries.length} date={date} vendors={data.vendors} categories={data.categories} />}

      <EntriesList entries={data.entries} date={date} locked={locked} />

      <ReconciliationPanel data={data} />
    </main>
  );
}
