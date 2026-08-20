import Link from "next/link";
import { loadPettyCashDay } from "@/lib/ledger/loadPettyCashDay";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { addDays, toIso } from "@/lib/schedule/weekMath";
import { AddEntryForm } from "../AddEntryForm";
import { EntriesList } from "../EntriesList";
import { ReconciliationPanel } from "../ReconciliationPanel";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";

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
      <main className="max-w-lg mx-auto p-4 sm:p-8">
        <Link href={`/ledger?month=${monthOfDate}`} className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          &larr; Back to {monthOfDate}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--ink-900)] mt-2 mb-4">{date}</h1>
        <Banner
          tone="info"
          title="This day hasn't happened yet"
          description={`Come back on ${date} to log petty cash and reconcile the drawer.`}
        />
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
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <Link href={`/ledger?month=${monthOfDate}`} className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Back to {monthOfDate}
      </Link>

      <div className="flex items-center justify-between mb-1 mt-2">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">Petty Cash</h1>
        <Badge tone={finalized ? "success" : "neutral"}>{finalized ? "Finalized" : "Draft"}</Badge>
      </div>
      <div className="flex items-center gap-3 text-sm mb-4">
        <Link href={`/ledger/day?date=${prevDate}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr;
        </Link>
        <span className="font-medium text-[var(--ink-900)]">{date}</span>
        <Link href={`/ledger/day?date=${nextDate}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &rarr;
        </Link>
      </div>

      {finalized && isAdmin && (
        <div className="mb-4">
          <Banner
            tone="info"
            title="Editing as admin"
            description="This day is already finalized. Changes save directly without re-opening it."
          />
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
