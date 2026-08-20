"use client";

import { useTransition } from "react";
import { deleteCardTransaction } from "@/lib/actions/card";
import type { CardTransactionView } from "@/lib/ledger/loadCard";
import { EmptyState } from "@/components/ui/Card";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** Card list, not a wide table -- same shape as EntriesList. */
export function TransactionsList({
  transactions,
  periodId,
  locked,
}: {
  transactions: CardTransactionView[];
  periodId: number;
  locked: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <div className="mb-4">
        <EmptyState message="No transactions logged yet for this period." />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] mb-4 text-sm bg-[var(--card)]">
      {transactions.map((t) => (
        <TransactionRow key={t.id} transaction={t} periodId={periodId} locked={locked} />
      ))}
    </ul>
  );
}

function TransactionRow({ transaction, periodId, locked }: { transaction: CardTransactionView; periodId: number; locked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const isCredit = transaction.amount < 0;

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {transaction.categoryName}
          <span className="text-[var(--ink-500)] font-normal"> · {transaction.date}</span>
        </div>
        {transaction.memo && <div className="text-[var(--ink-500)] text-xs mt-0.5">{transaction.memo}</div>}
        <div className="text-[var(--ink-500)] opacity-75 text-[11px] mt-0.5">by {transaction.createdByName}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={"font-medium tabular-nums" + (isCredit ? " text-[var(--danger)]" : " text-[var(--ink-900)]")}>
          {formatMoney(transaction.amount)}
        </span>
        {!locked && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deleteCardTransaction(transaction.id, periodId))}
            className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
            aria-label={`Remove ${transaction.categoryName} transaction`}
          >
            <XIcon width={16} height={16} />
          </button>
        )}
      </div>
    </li>
  );
}
