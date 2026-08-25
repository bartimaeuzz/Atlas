"use client";

import { useId, useRef, useState, useTransition } from "react";
import { updateCardTransaction } from "@/lib/actions/card";
import type { CardTransactionView } from "@/lib/ledger/loadCard";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Select, TextInput } from "@/components/ui/Field";
import { formatMoney } from "../formatMoney";

/** Edits a committed line's memo, category, or date (2026-08-25 --
 * Oliver's "rename and tag": imported lines arrive with the bank's raw
 * description). The amount is shown but NOT editable -- changing money
 * means delete-and-re-add or split, so the paths that can move the
 * reconciliation totals stay few and explicit. */
export function EditTransactionDialog({
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
  const [date, setDate] = useState(transaction.date);
  const [categoryId, setCategoryId] = useState<number>(transaction.categoryId);
  const [memo, setMemo] = useState(transaction.memo ?? "");

  return (
    <Modal open={open} onClose={onClose} width={420} labelledBy={titleId} initialFocus={cancelRef}>
      <div className="p-4 space-y-3">
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--ink-900)]">
          Edit this transaction
        </h2>
        <p className="text-sm text-[var(--ink-500)]">
          Amount stays {formatMoney(transaction.amount)} — to change the amount, remove the line and add it again, or
          split it.
        </p>

        {error && <Banner tone="danger" title="Couldn't save" description={error} />}

        <TextInput
          type="date"
          label="Transaction date (as shown on statement)"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Select label="Category" required value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <TextInput
          type="text"
          label="Memo"
          placeholder="e.g. Restaurant Depot online order"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 pt-1">
          {/* Cancel left + initialFocus: a stray Enter dismisses. */}
          <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPending || !date || !categoryId}
            loading={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                // asActionResult never throws, so this async body can't
                // strand the transition spinner.
                const res = await updateCardTransaction(transaction.id, periodId, { date, categoryId, memo });
                if (res.error) setError(res.error);
                else onClose();
              });
            }}
          >
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
