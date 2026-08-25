"use client";

import { useState, useTransition } from "react";
import { deleteLedgerCard } from "@/lib/actions/card";
import { DangerConfirmDialog } from "@/components/ui/DangerConfirmDialog";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Admin-only hard delete for a card (2026-08-25, Oliver): erases the
 * card, every statement period (reconciled ones included), and every
 * transaction under them. Fronted by the typed-word dialog because it
 * is genuinely irreversible in-app -- the recovery path is re-importing
 * the statement files, which is why the copy names it ("annoying, not
 * severe"). The action re-checks ADMIN + LEDGER_CARD_MANAGE regardless
 * of what this renders. */
export function DeleteCardButton({
  cardId,
  cardName,
  periodCount,
  transactionCount,
  earliestPeriodStart,
}: {
  cardId: number;
  cardName: string;
  periodCount: number;
  transactionCount: number;
  earliestPeriodStart: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const description =
    periodCount === 0
      ? `This permanently deletes ${cardName}. It has no statement periods yet, so no reconciliation data is lost.`
      : `This permanently deletes ${cardName} and everything reconciled under it — ${periodCount} statement period${
          periodCount === 1 ? "" : "s"
        } and ${transactionCount} transaction${transactionCount === 1 ? "" : "s"} since ${earliestPeriodStart}. Analytics and the P&L lose those expenses too. Getting them back means importing each statement file again.`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={`text-xs text-[var(--ink-500)] hover:text-[var(--danger)] underline ${TAP_TARGET_PAD}`}
        aria-label={`Delete ${cardName}`}
      >
        Delete
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
      <DangerConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete this card and all its data?"
        description={description}
        confirmLabel="Delete card"
        loading={isPending}
        onConfirm={() =>
          startTransition(async () => {
            // asActionResult never throws, so this async body can't
            // strand the transition spinner.
            const res = await deleteLedgerCard(cardId);
            if (res.error) {
              setError(res.error);
              setOpen(false);
            }
            // On success the revalidated page drops this row entirely.
          })
        }
      />
    </>
  );
}
