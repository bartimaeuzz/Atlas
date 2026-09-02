"use client";

import { useState, useTransition } from "react";
import { deleteCardTransaction } from "@/lib/actions/card";
import type { CardTransactionView } from "@/lib/ledger/loadCard";
import { EmptyState } from "@/components/ui/Card";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD, TAP_TARGET_PAD_44 } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditTransactionDialog } from "./EditTransactionDialog";
import { SplitTransactionDialog } from "./SplitTransactionDialog";

/** Card list, not a wide table -- same shape as EntriesList. */
export function TransactionsList({
  transactions,
  periodId,
  locked,
  categories,
}: {
  transactions: CardTransactionView[];
  periodId: number;
  locked: boolean;
  categories: { id: number; name: string }[];
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
        <TransactionRow key={t.id} transaction={t} periodId={periodId} locked={locked} categories={categories} />
      ))}
    </ul>
  );
}

/** 2026-08-21 visual-audit fix: same permanent-delete-on-one-click gap
 * fixed in EntriesList.tsx the same day (see that file's doc comment) --
 * this is its card-channel twin, and deleting a transaction here also
 * silently moves the period's reconciliation total. Now gated behind
 * ConfirmDialog. */
function TransactionRow({
  transaction,
  periodId,
  locked,
  categories,
}: {
  transaction: CardTransactionView;
  periodId: number;
  locked: boolean;
  categories: { id: number; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const isCredit = transaction.amount < 0;

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {transaction.categoryName}
          <span className="text-[var(--ink-500)] font-normal"> · {transaction.date}</span>
        </div>
        {transaction.memo && <div className="text-[var(--ink-500)] text-xs mt-0.5">{transaction.memo}</div>}
        <div className="text-[var(--ink-500)] opacity-75 text-xs mt-0.5">by {transaction.createdByName}</div>
        {!locked && (
          <div className="flex items-center gap-3 mt-0.5">
            {/* Word buttons, not icons: "rename and tag" (edit) and split
                are 2026-08-25 additions for cleaning up imported lines. */}
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD_44}`}
              aria-label={`Edit ${transaction.categoryName} transaction`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setSplitOpen(true)}
              className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD_44}`}
              aria-label={`Split ${transaction.categoryName} transaction`}
            >
              Split
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={"font-medium tabular-nums" + (isCredit ? " text-[var(--danger)]" : " text-[var(--ink-900)]")}>
          {formatMoney(transaction.amount)}
        </span>
        {!locked && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
            className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
            aria-label={`Remove ${transaction.categoryName} transaction`}
          >
            <XIcon width={16} height={16} />
          </button>
        )}
        {/* Conditionally mounted so each open starts from the row's
            current values instead of a stale earlier attempt. */}
        {editOpen && (
          <EditTransactionDialog
            open
            onClose={() => setEditOpen(false)}
            transaction={transaction}
            periodId={periodId}
            categories={categories}
          />
        )}
        {splitOpen && (
          <SplitTransactionDialog
            open
            onClose={() => setSplitOpen(false)}
            transaction={transaction}
            periodId={periodId}
            categories={categories}
          />
        )}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Remove this transaction?"
          description={`${transaction.categoryName} · ${transaction.date} — ${formatMoney(transaction.amount)}. This deletes it for good and changes what this period has logged against the statement. It can't be undone.`}
          confirmLabel="Remove"
          loading={isPending}
          onConfirm={() =>
            startTransition(async () => {
              await deleteCardTransaction(transaction.id, periodId);
              setConfirmOpen(false);
            })
          }
        />
      </div>
    </li>
  );
}
