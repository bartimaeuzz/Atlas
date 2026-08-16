import Link from "next/link";
import { loadCardStatementPeriodDetail } from "@/lib/ledger/loadCard";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { AddTransactionForm } from "../AddTransactionForm";
import { TransactionsList } from "../TransactionsList";
import { ReconcilePanel } from "../ReconcilePanel";
import { PeriodHeaderForm } from "../PeriodHeaderForm";

/** One statement period's work: log transactions against it, then
 * reconcile once the logged total matches the statement's own total.
 * Same "editable pre-lock, admin-only post-lock" shape as /ledger/day --
 * a RECONCILED period is normally locked, except an ADMIN account can
 * still correct it directly (doesn't un-reconcile it, just updates the
 * numbers underneath). */
export default async function CardStatementPeriodPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const params = await searchParams;
  const periodId = Number(params.id);

  if (!periodId) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
        <p className="text-sm text-red-600">No statement period specified.</p>
      </main>
    );
  }

  const data = await loadCardStatementPeriodDetail(periodId);
  if (!data) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
        <Link href="/ledger/card" className="text-sm text-neutral-500 hover:text-black">
          &larr; Card
        </Link>
        <p className="text-sm text-red-600 mt-4">That statement period doesn&apos;t exist.</p>
      </main>
    );
  }

  const session = await getCurrentStaffSession();
  const isAdmin = session?.systemRole === "ADMIN";
  const reconciled = data.status === "reconciled";
  const editable = !reconciled || isAdmin;
  const matches = Math.abs(data.loggedTotal - data.statementTotal) < 0.01;

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <Link href="/ledger/card" className="text-sm text-neutral-500 hover:text-black">
        &larr; Card
      </Link>

      <div className="flex items-center justify-between mb-1 mt-2">
        <h1 className="text-2xl font-semibold">{data.cardName}</h1>
        <span
          className={
            "text-xs px-2 py-1 rounded font-medium " +
            (reconciled ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600")
          }
        >
          {reconciled ? "Reconciled" : "Draft"}
        </span>
      </div>

      {reconciled && isAdmin && (
        <div className="mb-4 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded p-2">
          Editing as admin — this period is already reconciled. Changes save directly without re-opening it.
        </div>
      )}

      <PeriodHeaderForm
        periodId={data.id}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        statementTotal={data.statementTotal}
        editable={editable}
      />

      {editable && (
        <AddTransactionForm
          key={data.transactions.length}
          periodId={data.id}
          categories={data.categories}
        />
      )}

      <TransactionsList transactions={data.transactions} periodId={data.id} locked={!editable} />

      <ReconcilePanel periodId={data.id} loggedTotal={data.loggedTotal} statementTotal={data.statementTotal} matches={matches} reconciled={reconciled} />
    </main>
  );
}
