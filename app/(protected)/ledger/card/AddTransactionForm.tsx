"use client";

import { useActionState } from "react";
import { addCardTransaction, type CardTransactionActionState } from "@/lib/actions/card";
import { toIso } from "@/lib/schedule/weekMath";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: CardTransactionActionState = { error: null };

/** Quick-add form for one line off the statement -- same mobile-first
 * shape as Petty Cash's AddEntryForm. Amount accepts a negative number
 * for a credit/refund line, unlike Petty Cash's always-positive payout. */
export function AddTransactionForm({
  periodId,
  categories,
}: {
  periodId: number;
  categories: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(addCardTransaction, initialState);

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      <input type="hidden" name="periodId" value={periodId} />
      {state.error && <Banner tone="danger" title="Couldn't add transaction" description={state.error} />}
      <div className="grid grid-cols-2 gap-2">
        <TextInput type="date" name="date" label="Date" required defaultValue={toIso(new Date())} />
        <Select name="categoryId" label="Category" required>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
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
    </form>
  );
}
