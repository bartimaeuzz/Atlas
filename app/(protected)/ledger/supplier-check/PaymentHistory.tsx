"use client";

import { useState } from "react";
import type { PaymentHistoryView } from "@/lib/ledger/loadSupplierCheck";

/** Most recent checks first, click a row to expand the invoices it
 * settled (2026-08-14 follow-up ask: "recent payment, items should be
 * able to be click to see detail"). Client component since expand state
 * is purely local UI state, no server round trip needed -- the detail
 * is already loaded with the list. */
export function PaymentHistory({ payments }: { payments: PaymentHistoryView[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (payments.length === 0) {
    return <p className="text-sm text-neutral-400 border rounded p-3">No payments recorded yet.</p>;
  }

  return (
    <ul className="divide-y border rounded text-sm">
      {payments.map((p) => {
        const open = openId === p.id;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : p.id)}
              className="w-full text-left px-3 py-2.5 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.vendorName}</span>
                <span className="font-medium">${p.totalAmount.toFixed(2)}</span>
              </div>
              <div className="text-neutral-500 text-xs mt-0.5">
                {p.paidDate}
                {p.checkNumber && ` · check #${p.checkNumber}`} · by {p.paidByName}
              </div>
              <div className="text-neutral-400 text-[11px] mt-0.5">
                {p.invoices.length} invoice{p.invoices.length === 1 ? "" : "s"} · {open ? "hide detail ▲" : "view detail ▼"}
              </div>
            </button>
            {open && (
              <ul className="px-3 pb-3 space-y-1.5 bg-neutral-50">
                {p.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-start justify-between text-xs border-t pt-1.5 first:border-t-0 first:pt-1.5"
                  >
                    <div>
                      <div className="font-medium">
                        #{inv.invoiceNumber} <span className="text-neutral-500 font-normal">· {inv.categoryName}</span>
                      </div>
                      {inv.description && <div className="text-neutral-500">{inv.description}</div>}
                      <div className="text-neutral-400">received {inv.receivedDate}</div>
                    </div>
                    <span className="font-medium shrink-0">${inv.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
