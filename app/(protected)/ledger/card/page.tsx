import Link from "next/link";
import { loadCardStatementPeriods } from "@/lib/ledger/loadCard";
import { LedgerTabs } from "../LedgerTabs";
import { PeriodsTable } from "./PeriodsTable";

/** Card landing page (2026-08-16) -- a flat list of every statement
 * period across every card, most recent first, same "holistic table"
 * shape as Supplier Check's Checks list rather than Petty Cash's
 * per-card sub-navigation, since most restaurants only have a handful of
 * cards and periods total. "New statement period" is its own page (see
 * ./new), same pattern as Supplier Check's "Log an invoice". */
export default async function CardPage() {
  const periods = await loadCardStatementPeriods();

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Ledger</h1>
      <p className="text-neutral-500 text-sm mb-4">
        Reconcile each card&apos;s statement against what was actually charged.
      </p>

      <LedgerTabs active="card" />

      <div className="flex items-center justify-between gap-3 mb-6">
        <Link href="/ledger/card/new" className="px-4 py-2 rounded bg-black text-white text-sm hover:bg-neutral-800">
          + New statement period
        </Link>
        <Link href="/ledger/cards" className="text-xs text-neutral-500 hover:text-black underline">
          Manage cards
        </Link>
      </div>

      {periods.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-4">
          No statement periods yet. Start one once a card&apos;s statement is ready to reconcile.
        </p>
      ) : (
        <PeriodsTable periods={periods} />
      )}
    </main>
  );
}
