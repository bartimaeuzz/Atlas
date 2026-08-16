"use client";

import { useActionState } from "react";
import { addCardTransaction, type CardTransactionActionState } from "@/lib/actions/card";
import { toIso } from "@/lib/schedule/weekMath";

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
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2 mb-4">
      <input type="hidden" name="periodId" value={periodId} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Date</span>
          <input type="date" name="date" required defaultValue={toIso(new Date())} className="border rounded px-2 py-2 text-sm w-full" />
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Category</span>
          <select name="categoryId" required className="border rounded px-2 py-2 text-sm w-full">
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Memo</span>
        <input type="text" name="memo" placeholder="e.g. Restaurant Depot online order" className="border rounded px-2 py-2 text-sm w-full" />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Amount (negative for a credit/refund)</span>
        <input
          type="number"
          name="amount"
          step="0.01"
          required
          placeholder="0.00"
          className="border rounded px-2 py-2 text-sm w-full"
          inputMode="decimal"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "+ Add transaction"}
      </button>
    </form>
  );
}
