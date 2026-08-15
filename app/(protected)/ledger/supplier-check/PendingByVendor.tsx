"use client";

import { useTransition } from "react";
import { deletePendingInvoice } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";

/** One vendor's not-yet-checked invoices -- read-only reference plus the
 * ability to delete a mis-logged invoice before it's checked. Printing
 * is now centralized in the "Print Checks" popup (PrintChecksButton.tsx,
 * 2026-08-14 follow-up) rather than a per-vendor button here, so a
 * manager can flexibly choose one/some/all vendors in one place instead
 * of this card's own print action. */
export function PendingByVendor({ group }: { group: VendorPendingGroup }) {
  const [isDeleting, startDelete] = useTransition();

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{group.vendorName}</span>
        <span className="text-xs text-neutral-500">${group.totalPending.toFixed(2)} pending</span>
      </div>

      <ul className="divide-y text-sm">
        {group.invoices.map((inv) => (
          <li key={inv.id} className="py-2 flex items-start justify-between gap-2">
            <div>
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
    </div>
  );
}
