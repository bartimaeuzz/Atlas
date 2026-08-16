import Link from "next/link";
import type { CardStatementPeriodView } from "@/lib/ledger/loadCard";

/** Card list, not a wide table -- mirrors EntriesList's phone-first shape
 * (this app's established convention for Ledger lists). */
export function PeriodsTable({ periods }: { periods: CardStatementPeriodView[] }) {
  return (
    <ul className="divide-y border rounded text-sm">
      {periods.map((p) => (
        <li key={p.id}>
          <Link href={`/ledger/card/period?id=${p.id}`} className="block px-3 py-2.5 hover:bg-neutral-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {p.cardName} — {p.periodStart} to {p.periodEnd}
              </span>
              <StatusBadge period={p} />
            </div>
            <div className="text-neutral-500 text-xs mt-0.5">
              Logged ${p.loggedTotal.toFixed(2)} of ${p.statementTotal.toFixed(2)} statement total
              {p.status === "reconciled" && p.reconciledByName ? ` · reconciled by ${p.reconciledByName}` : ""}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ period }: { period: CardStatementPeriodView }) {
  if (period.status === "reconciled") {
    return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 shrink-0">Reconciled</span>;
  }
  if (period.matches) {
    return <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">Ready</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 shrink-0">Draft</span>;
}
