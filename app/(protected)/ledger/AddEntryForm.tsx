"use client";

import { useActionState } from "react";
import { addPettyCashEntry, type PettyCashEntryActionState } from "@/lib/actions/ledger";

const initialState: PettyCashEntryActionState = { error: null };

/** Quick-add form for one petty cash entry -- mobile-first (stacked
 * fields, big tap targets), since this is the "someone's paying a
 * vendor at the back door and typing it in on their phone" moment
 * Oliver described. Doesn't redirect on success (addPettyCashEntry just
 * revalidates) so a manager can add several entries in a row without
 * losing their place; the parent remounts this form via `resetKey`
 * (entries.length) after each successful add so the fields clear. */
export function AddEntryForm({
  date,
  vendors,
  categories,
}: {
  date: string;
  vendors: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(addPettyCashEntry, initialState);

  return (
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2 mb-4">
      <input type="hidden" name="date" value={date} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
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
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Vendor (optional)</span>
          <select name="vendorId" className="border rounded px-2 py-2 text-sm w-full">
            <option value="">No vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Note</span>
        <input type="text" name="note" placeholder="e.g. Pay out to Tommy: flowers" className="border rounded px-2 py-2 text-sm w-full" />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Amount</span>
        <input
          type="number"
          name="amount"
          step="0.01"
          min="0.01"
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
        {isPending ? "Adding…" : "+ Add expense"}
      </button>
    </form>
  );
}
