"use client";

import { useState, useTransition } from "react";
import { deletePendingInvoice } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";
import { EditInvoiceForm } from "./EditInvoiceForm";
import { Card } from "@/components/ui/Card";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** One vendor's not-yet-checked invoices -- read-only reference plus the
 * ability to edit a typo/wrong amount (2026-08-15) or delete a
 * mis-logged invoice before it's checked -- no confirmation code needed
 * here, nothing's locked in yet (same access level as delete already
 * had). Printing is now centralized in the "Print Checks" popup
 * (PrintChecksButton.tsx, 2026-08-14 follow-up) rather than a per-vendor
 * button here, so a manager can flexibly choose one/some/all vendors in
 * one place instead of this card's own print action. */
export function PendingByVendor({ group }: { group: VendorPendingGroup }) {
  const [isDeleting, startDelete] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[var(--ink-900)]">{group.vendorName}</span>
        <span className="text-xs tabular-nums text-[var(--ink-500)]">{formatMoney(group.totalPending)} pending</span>
      </div>

      <ul className="divide-y divide-[var(--border)] text-sm">
        {group.invoices.map((inv) => (
          <li key={inv.id} className="py-2">
            {editingId === inv.id ? (
              <EditInvoiceForm
                invoiceId={inv.id}
                invoiceNumber={inv.invoiceNumber}
                description={inv.description}
                amount={inv.amount}
                requireAuditorCode={false}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-[var(--ink-900)]">
                    #{inv.invoiceNumber} <span className="text-[var(--ink-500)] font-normal">· {inv.categoryName}</span>
                  </div>
                  {inv.description && <div className="text-[var(--ink-500)] text-xs">{inv.description}</div>}
                  <div className="text-[var(--ink-500)] opacity-75 text-[11px]">
                    {inv.receivedDate} · logged by {inv.createdByName}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(inv.amount)}</span>
                  <button
                    type="button"
                    onClick={() => setEditingId(inv.id)}
                    className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] text-xs underline ${TAP_TARGET_PAD}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => startDelete(() => deletePendingInvoice(inv.id))}
                    className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
                    aria-label={`Remove invoice ${inv.invoiceNumber}`}
                  >
                    <XIcon width={16} height={16} />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
