"use client";

import { useActionState } from "react";
import { createStatementPeriod, type CardActionState } from "@/lib/actions/card";

const initialState: CardActionState = { error: null };

/** Starts a new statement period: pick the card, the statement's date
 * range, and its total charge amount (the reconciliation target). Once
 * created, transactions get logged against it on the period's own
 * detail page. */
export function NewPeriodForm({ cards }: { cards: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createStatementPeriod, initialState);

  return (
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Card</span>
        <select name="cardId" required className="border rounded px-2 py-2 text-sm w-full">
          <option value="">Choose…</option>
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Statement start</span>
          <input type="date" name="periodStart" required className="border rounded px-2 py-2 text-sm w-full" />
        </label>
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Statement end</span>
          <input type="date" name="periodEnd" required className="border rounded px-2 py-2 text-sm w-full" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Statement total (from the bank statement)</span>
        <input
          type="number"
          name="statementTotal"
          step="0.01"
          min="0"
          required
          placeholder="0.00"
          inputMode="decimal"
          className="border rounded px-2 py-2 text-sm w-full"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Start period"}
      </button>
    </form>
  );
}
