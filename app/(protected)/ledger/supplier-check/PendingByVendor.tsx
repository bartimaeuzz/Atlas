"use client";

import { useActionState, useState, useTransition } from "react";
import { recordSupplierPayment, deletePendingInvoice, type RecordPaymentActionState } from "@/lib/actions/supplierCheck";
import { toIso } from "@/lib/schedule/weekMath";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";

const initialState: RecordPaymentActionState = { error: null };

/** One vendor's pending invoices, with checkboxes feeding a single
 * "record payment" form below the list -- confirmed with Oliver that
 * one check can settle several invoices from the same vendor at once
 * ("printed payment check can reconcile into one check for each
 * supplier"). The checkboxes live in the invoice list but submit via
 * this vendor's form using the HTML `form` attribute, so the list and
 * the payment form can be laid out independently. */
export function PendingByVendor({ group }: { group: VendorPendingGroup }) {
  const [state, formAction, isPending] = useActionState(recordSupplierPayment, initialState);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDeleting, startDelete] = useTransition();
  const formId = `pay-vendor-${group.vendorId}`;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTotal = group.invoices
    .filter((inv) => selected.has(inv.id))
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{group.vendorName}</span>
        <span className="text-xs text-neutral-500">${group.totalPending.toFixed(2)} pending</span>
      </div>

      <ul className="divide-y text-sm mb-3">
        {group.invoices.map((inv) => (
          <li key={inv.id} className="py-2 flex items-start gap-2">
            <input
              type="checkbox"
              form={formId}
              name="invoiceIds"
              value={inv.id}
              checked={selected.has(inv.id)}
              onChange={() => toggle(inv.id)}
              className="mt-1"
              aria-label={`Select invoice ${inv.invoiceNumber}`}
            />
            <div className="flex-1">
              <div className="font-medium">
                #{inv.invoiceNumber} <span className="text-neutral-500 font-normal">· {inv.categoryName}</span>
              </div>
              {inv.description && <div className="text-neutral-500 text-xs">{inv.description}</div>}
              <div className="text-neutral-400 text-[11px]">
                {inv.receivedDate} · logged by {inv.createdByName}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-medium">${inv.amount.toFixed(2)}</span>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => startDelete(() => deletePendingInvoice(inv.id))}
                className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
                aria-label={`Remove invoice ${inv.invoiceNumber}`}
              >
                &times;
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form id={formId} action={formAction} className="space-y-2 bg-neutral-50 rounded p-2">
        <input type="hidden" name="vendorId" value={group.vendorId} />
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">Paid date</span>
            <input
              type="date"
              name="paidDate"
              required
              defaultValue={toIso(new Date())}
              className="border rounded px-2 py-1.5 text-sm w-full"
            />
          </label>
          <label className="block text-xs">
            <span className="block text-neutral-500 mb-1">Check # (optional)</span>
            <input type="text" name="checkNumber" className="border rounded px-2 py-1.5 text-sm w-full" />
          </label>
        </div>
        <button
          type="submit"
          disabled={isPending || selected.size === 0}
          className="w-full bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending
            ? "Recording…"
            : selected.size === 0
              ? "Select invoices to pay"
              : `Mark ${selected.size} paid — $${selectedTotal.toFixed(2)}`}
        </button>
      </form>
    </div>
  );
}
