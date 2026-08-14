import Link from "next/link";
import { loadPettyCashDay } from "@/lib/ledger/loadPettyCashDay";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { addDays, toIso } from "@/lib/schedule/weekMath";
import { AddEntryForm } from "../AddEntryForm";
import { EntriesList } from "../EntriesList";
import { ReconciliationPanel } from "../ReconciliationPanel";

/** The actual day-level Petty Cash work -- add expenses, review entries,
 * reconcile the drawer. Moved here from the bare /ledger route in the
 * 2026-08-14 restructure (/ledger is now a month-list picker, see
 * ../page.tsx); reached by clicking a date there.
 *
 * Two rules added in that same restructure, both confirmed with Oliver:
 * 1. A day in the future ("hasn't happened yet") can't be worked on at
 *    all -- shows a placeholder instead of the entry form. Enforced here
 *    AND in lib/actions/ledger.ts (the actions are the real guard; this
 *    is the UI-level version of the same rule).
 * 2. A FINALIZED day is normally locked, same as before -- except an
 *    ADMIN-role account can still edit it (entries and reconciliation),
 *    confirmed: "let use admin as authorized to edit passed day or
 *    finalized item." Editing as admin does NOT unfinalize the day; it
 *    just updates the numbers underneath the existing finalized record. */
export default async function LedgerDayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const todayIso = toIso(new Date());
  const date = params.date || todayIso;
  const monthOfDate = date.slice(0, 7);
  const isFuture = date > todayIso;

  if (isFuture) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
        <Link href={`/ledger?month=${monthOfDate}`} className="text-sm text-neutral-500 hover:text-black">
          &larr; Back to {monthOfDate}
        </Link>
        <h1 className="text-2xl font-semibold mt-2 mb-4">{date}</h1>
        <p className="text-sm text-neutral-500 border rounded p-4 bg-neutral-50">
          This day hasn&apos;t happened yet — come back on {date} to log petty cash and reconcile the
          drawer.
        </p>
      </main>
    );
  }

  const session = await getCurrentStaffSession();
  const isAdmin = session?.systemRole === "ADMIN";

  const data = await loadPettyCashDay(date);
  const finalized = data.status === "finalized";
  const editable = !finalized || isAdmin;

  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <Link href={`/ledger?month=${monthOfDate}`} className="text-sm text-neutral-500 hover:text-black">
        &larr; Back to {monthOfDate}
      </Link>

      <div className="flex items-center justify-between mb-1 mt-2">
        <h1 className="text-2xl font-semibold">Petty Cash</h1>
        <span
          className={
            "text-xs px-2 py-1 rounded font-medium " +
            (finalized ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600")
          }
        >
          {finalized ? "Finalized" : "Draft"}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm mb-4">
        <Link href={`/ledger/day?date=${prevDate}`} className="text-neutral-500 hover:text-black underline">
          &larr;
        </Link>
        <span className="font-medium">{date}</span>
        <Link href={`/ledger/day?date=${nextDate}`} className="text-neutral-500 hover:text-black underline">
          &rarr;
        </Link>
      </div>

      {finalized && isAdmin && (
        <div className="mb-4 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded p-2">
          Editing as admin — this day is already finalized. Changes save directly without re-opening it.
        </div>
      )}

      {editable && (
        <AddEntryForm key={data.entries.length} date={date} vendors={data.vendors} categories={data.categories} />
      )}

      <EntriesList entries={data.entries} date={date} locked={!editable} />

      <ReconciliationPanel data={data} isAdmin={isAdmin} />
    </main>
  );
}
