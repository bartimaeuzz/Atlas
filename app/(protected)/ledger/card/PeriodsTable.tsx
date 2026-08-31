import Link from "next/link";
import type { CardStatementPeriodView } from "@/lib/ledger/loadCard";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "../formatMoney";

/** Card list, not a wide table -- mirrors EntriesList's phone-first shape
 * (this app's established convention for Ledger lists). */
export function PeriodsTable({ periods }: { periods: CardStatementPeriodView[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm bg-[var(--card)]">
      {periods.map((p) => (
        <li key={p.id}>
          <Link href={`/ledger/card/period?id=${p.id}`} className="block px-3 py-2.5 hover:bg-[var(--hover)]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-[var(--ink-900)]">
                {p.cardName} — {p.periodStart} to {p.periodEnd}
              </span>
              <PeriodStatusBadge period={p} />
            </div>
            <div className="text-[var(--ink-500)] text-xs mt-0.5">
              Charges {formatMoney(p.chargesLogged)} of {formatMoney(p.statementTotal)}
              {/* Payments side only when it has something to say -- most
                  periods have no payments/refunds. */}
              {(p.creditsLogged !== 0 || p.paymentsCreditsTotal !== 0) &&
                ` · payments & credits ${formatMoney(p.creditsLogged)} of ${formatMoney(p.paymentsCreditsTotal)}`}
              {p.status === "reconciled" && p.reconciledByName ? ` · reconciled by ${p.reconciledByName}` : ""}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PeriodStatusBadge({ period }: { period: CardStatementPeriodView }) {
  if (period.status === "reconciled") return <Badge tone="success">Reconciled</Badge>;
  if (period.matches) return <Badge tone="warning">Ready</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}
