"use client";

import { useTransition } from "react";
import { deleteCardTransaction } from "@/lib/actions/card";
import type { CardTransactionView } from "@/lib/ledger/loadCard";

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
    return <p className="text-sm text-neutral-400 border rounded p-3 mb-4">No transactions logged yet for this period.</p>;
  }

  return (
    <ul className="divide-y border rounded mb-4 text-sm">
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
        <div className="font-medium">
          {transaction.categoryName}
          <span className="text-neutral-400 font-normal"> · {transaction.date}</span>
        </div>
        {transaction.memo && <div className="text-neutral-500 text-xs mt-0.5">{transaction.memo}</div>}
        <div className="text-neutral-400 text-[11px] mt-0.5">by {transaction.createdByName}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={"font-medium" + (isCredit ? " text-green-700" : "")}>
          {isCredit ? "-" : ""}${Math.abs(transaction.amount).toFixed(2)}
        </span>
        {!locked && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deleteCardTransaction(transaction.id, periodId))}
            className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
            aria-label={`Remove ${transaction.categoryName} transaction`}
          >
            &times;
          </button>
        )}
      </div>
    </li>
  );
}
