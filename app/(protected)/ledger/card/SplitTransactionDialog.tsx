"use client";

import { useId, useRef, useState, useTransition } from "react";
import { splitCardTransaction } from "@/lib/actions/card";
import type { CardTransactionView } from "@/lib/ledger/loadCard";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { formatMoney } from "../formatMoney";
import { SplitPartsEditor, emptyPart, partsComplete, partsSumCents, type EditablePart } from "./SplitPartsEditor";

/** Splits one committed statement line (usually an imported one) into
 * parts by category (2026-08-25). Built on Modal, not ConfirmDialog --
 * this is a form-in-a-popup like Print Checks, not a light confirm.
 * Save stays disabled until every part is complete AND the parts sum to
 * the original amount exactly (error prevention over messages -- the
 * live remainder line always says why). The server re-validates the sum
 * in cents regardless; client state is never trusted on a money path. */
export function SplitTransactionDialog({
  open,
  onClose,
  transaction,
  periodId,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  transaction: CardTransactionView;
  periodId: number;
  categories: { id: number; name: string }[];
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [parts, setParts] = useState<EditablePart[]>(() => [
    // Part 1 starts on the original's category; memos start from the
    // original so "Amazon" becomes "Amazon — kitchen items" by editing,
    // not retyping.
    { categoryId: transaction.categoryId, amount: "", memo: transaction.memo ?? "" },
    { ...emptyPart(), memo: transaction.memo ?? "" },
  ]);

  const targetCents = Math.round(transaction.amount * 100);
  const ready = partsComplete(parts) && partsSumCents(parts) === targetCents;

  return (
    <Modal open={open} onClose={onClose} width={420} labelledBy={titleId} initialFocus={cancelRef}>
      <div className="p-4 space-y-3">
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--ink-900)]">
          Split this transaction
        </h2>
        <div className="text-sm text-[var(--ink-500)]">
          <span className="font-medium text-[var(--ink-900)]">
            {transaction.memo || transaction.categoryName} · {transaction.date} · {formatMoney(transaction.amount)}
          </span>
          <p className="mt-1">
            Break this one statement line into parts by category. The parts keep the same date and must add up to the
            original amount exactly.
          </p>
        </div>

        {error && <Banner tone="danger" title="Couldn't split" description={error} />}

        <SplitPartsEditor parts={parts} onChange={setParts} categories={categories} targetAmount={transaction.amount} />

        <div className="flex items-center justify-end gap-2 pt-1">
          {/* Cancel left + initialFocus: a stray Enter dismisses, never
              rewrites money -- same rule as ConfirmDialog. */}
          <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !ready}
            loading={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                // asActionResult never throws, so this async body can't
                // strand the transition spinner.
                const res = await splitCardTransaction(
                  transaction.id,
                  periodId,
                  JSON.stringify(parts.map((p) => ({ categoryId: p.categoryId === "" ? 0 : p.categoryId, amount: Number(p.amount), memo: p.memo })))
                );
                if (res.error) setError(res.error);
                else onClose();
              });
            }}
          >
            {isPending ? "Splitting…" : `Split into ${parts.length} parts`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
