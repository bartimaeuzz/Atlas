"use client";

import { useActionState } from "react";
import { addPettyCashEntry, type PettyCashEntryActionState } from "@/lib/actions/ledger";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

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
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      <input type="hidden" name="date" value={date} />
      {state.error && <Banner tone="danger" title="Couldn't add expense" description={state.error} />}
      <div className="grid grid-cols-2 gap-2">
        <Select name="categoryId" label="Category" required>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="vendorId" label="Vendor (optional)">
          <option value="">No vendor</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </div>
      <TextInput type="text" name="note" label="Note" placeholder="e.g. Pay out to Tommy: flowers" />
      <TextInput
        type="number"
        name="amount"
        label="Amount"
        step="0.01"
        min="0.01"
        required
        placeholder="0.00"
        inputMode="decimal"
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Adding…" : "+ Add expense"}
      </Button>
    </form>
  );
}
