"use client";

import { useActionState } from "react";
import { logSupplierInvoice, type SupplierInvoiceActionState } from "@/lib/actions/supplierCheck";
import { toIso } from "@/lib/schedule/weekMath";

const initialState: SupplierInvoiceActionState = { error: null };

/** Logging an invoice is its own form, separate from Petty Cash's
 * AddEntryForm -- Oliver's own words: "the input form on petty cash
 * now won't work on delivery invoice based supplier." No amount-paid,
 * no due date field (confirmed not needed) -- just what arrived and
 * when, so it can sit as pending until a check settles it later. */
export function LogInvoiceForm({
  vendors,
  categories,
}: {
  vendors: { id: number; name: string }[];
  categories: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(logSupplierInvoice, initialState);

  return (
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2 mb-4">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Date received</span>
        <input
          type="date"
          name="receivedDate"
          required
          defaultValue={toIso(new Date())}
          className="border rounded px-2 py-2 text-sm w-full"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1 text-xs">Vendor</span>
          <select name="vendorId" required className="border rounded px-2 py-2 text-sm w-full">
            <option value="">Choose…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
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
        <span className="block text-neutral-500 mb-1 text-xs">Invoice number</span>
        <input
          type="text"
          name="invoiceNumber"
          required
          placeholder="e.g. 142675"
          className="border rounded px-2 py-2 text-sm w-full"
        />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1 text-xs">Nature / package (optional)</span>
        <input
          type="text"
          name="description"
          placeholder="e.g. weekly produce order"
          className="border rounded px-2 py-2 text-sm w-full"
        />
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
          inputMode="decimal"
          className="border rounded px-2 py-2 text-sm w-full"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Logging…" : "+ Log invoice"}
      </button>
    </form>
  );
}
