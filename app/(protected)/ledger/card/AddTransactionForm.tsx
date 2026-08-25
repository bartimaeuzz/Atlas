"use client";

import { useActionState, useState } from "react";
import {
  addCardTransaction,
  addCardTransactionSplit,
  type CardTransactionActionState,
} from "@/lib/actions/card";
import { transactionDateWarning } from "@/lib/ledger/cardDateWarning";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { SplitPartsEditor, emptyPart, partsComplete, type EditablePart } from "./SplitPartsEditor";

const initialState: CardTransactionActionState = { error: null };

/** Quick-add form for one line off the statement -- same mobile-first
 * shape as Petty Cash's AddEntryForm. Amount accepts a negative number
 * for a credit/refund line, unlike Petty Cash's always-positive payout.
 *
 * 2026-08-25 (P&L-precision pass):
 *   - The date field starts EMPTY and is labelled as the transaction
 *     date printed on the statement -- it used to default to today,
 *     which is almost always the wrong date for statement entry, and
 *     the P&L buckets card expenses by this date.
 *   - A soft (never blocking) warning appears when the typed date can't
 *     plausibly be on this statement -- see lib/ledger/cardDateWarning.
 *   - Split mode: one printed line covering several categories (an
 *     Amazon order with Kitchen/Bar/FOH items) can be entered as parts
 *     in one go instead of faked as separate lines by hand. */
export function AddTransactionForm({
  periodId,
  periodStart,
  periodEnd,
  categories,
}: {
  periodId: number;
  periodStart: string;
  periodEnd: string;
  categories: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(addCardTransaction, initialState);
  const [splitState, splitFormAction, isSplitPending] = useActionState(addCardTransactionSplit, initialState);
  const [splitMode, setSplitMode] = useState(false);
  const [date, setDate] = useState("");
  const [parts, setParts] = useState<EditablePart[]>([emptyPart(), emptyPart()]);

  const dateWarning = transactionDateWarning(date, periodStart, periodEnd);
  const activeError = splitMode ? splitState.error : state.error;

  const dateField = (
    <TextInput
      type="date"
      name="date"
      label="Transaction date (as shown on statement)"
      required
      value={date}
      onChange={(e) => setDate(e.target.value)}
    />
  );

  const dateWarningBanner = dateWarning && (
    // Soft notice, not a Field error and not a min/max clamp -- a hard
    // block would reject correct data (statements carry genuinely odd
    // dates sometimes), which violates error prevention the other way.
    <Banner tone="warning" title="Double-check this date" description={dateWarning} />
  );

  if (splitMode) {
    return (
      <form action={splitFormAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
        <input type="hidden" name="periodId" value={periodId} />
        <input
          type="hidden"
          name="partsJson"
          value={JSON.stringify(
            parts.map((p) => ({ categoryId: p.categoryId === "" ? 0 : p.categoryId, amount: Number(p.amount), memo: p.memo }))
          )}
        />
        {activeError && <Banner tone="danger" title="Couldn't add transaction" description={activeError} />}
        <p className="text-sm font-medium text-[var(--ink-900)]">One statement line, split across categories</p>
        {dateField}
        {dateWarningBanner}
        <SplitPartsEditor parts={parts} onChange={setParts} categories={categories} targetAmount={null} />
        <Button type="submit" className="w-full" loading={isSplitPending} disabled={isSplitPending || !partsComplete(parts)}>
          {isSplitPending ? "Adding…" : `+ Add ${parts.length} parts`}
        </Button>
        <button
          type="button"
          onClick={() => setSplitMode(false)}
          className={`block text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
        >
          Back to a single line
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      <input type="hidden" name="periodId" value={periodId} />
      {activeError && <Banner tone="danger" title="Couldn't add transaction" description={activeError} />}
      <div className="grid grid-cols-2 gap-2">
        {dateField}
        <Select name="categoryId" label="Category" required>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {dateWarningBanner}
      <TextInput type="text" name="memo" label="Memo" placeholder="e.g. Restaurant Depot online order" />
      <TextInput
        type="number"
        name="amount"
        label="Amount (negative for a credit/refund)"
        step="0.01"
        required
        placeholder="0.00"
        inputMode="decimal"
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Adding…" : "+ Add transaction"}
      </Button>
      <button
        type="button"
        onClick={() => setSplitMode(true)}
        className={`block text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
      >
        One line covers more than one category? Split it
      </button>
    </form>
  );
}
