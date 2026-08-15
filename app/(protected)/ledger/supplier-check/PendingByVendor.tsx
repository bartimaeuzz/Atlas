"use client";

import { useState, useTransition } from "react";
import { deletePendingInvoice, printSupplierCheck } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";

/** One vendor's not-yet-checked invoices (2026-08-14 restructure) --
 * "Print check now" always combines EVERY pending invoice shown here
 * for this vendor into one check, confirmed with Oliver after talking
 * to Aey: "same vendor always get combined check." Replaces v45's
 * checkbox multi-select (recordSupplierPayment) -- no manual selection
 * needed anymore, the combining is automatic. Also this is the "export
 * this invoice to print check instantly" path for an urgent vendor
 * (e.g. maintenance) -- printing redirects straight to the .xlsx
 * download for just this new check. */
export function PendingByVendor({ group }: { group: VendorPendingGroup }) {
  const [checkNumber, setCheckNumber] = useState("");
  const [isPrinting, startPrint] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePrint() {
    setError(null);
    startPrint(async () => {
      try {
        const { paymentId } = await printSupplierCheck(group.vendorId, checkNumber.trim() || null);
        window.location.href = `/ledger/supplier-check/export?paymentIds=${paymentId}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't print check.");
      }
    });
  }

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{group.vendorName}</span>
        <span className="text-xs text-neutral-500">${group.totalPending.toFixed(2)} pending</span>
      </div>

      <ul className="divide-y text-sm mb-3">
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

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          placeholder="Check # (optional)"
          className="border rounded px-2 py-1.5 text-sm flex-1"
        />
        <button
          type="button"
          disabled={isPrinting}
          onClick={handlePrint}
          className="bg-black text-white px-3 py-1.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50 whitespace-nowrap"
        >
          {isPrinting ? "Printing…" : "Print check now"}
        </button>
      </div>
    </div>
  );
}
