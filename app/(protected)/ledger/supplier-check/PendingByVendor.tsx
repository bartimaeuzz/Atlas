"use client";

import { useState, useTransition } from "react";
import { deleteDraftInvoice, approveInvoice, unapproveInvoice } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup, PendingInvoiceView } from "@/lib/ledger/loadSupplierCheck";
import { EditInvoiceForm } from "./EditInvoiceForm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InvoicePhotosButton } from "./InvoicePhotosButton";
import { XIcon, AlertTriangleIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** One vendor's open (Draft + Ready) invoices — the review surface of
 * the 2026-08-31 lifecycle rebuild. Aey's real weekly rhythm, spec'd
 * and approved: managers log Drafts daily (edit/delete freely, nothing
 * is locked yet); the approver walks this list against the attached
 * bills and approves each one to Ready — which LOCKS it — then exports.
 * A Ready row shows who approved it and offers the approver an Unlock
 * back to Draft; nobody may approve an invoice they logged themselves
 * (the server refuses; the button also hides, so the rule reads as a
 * fact rather than an error). */
export function PendingByVendor({
  group,
  canApprove,
  viewerId,
}: {
  group: VendorPendingGroup;
  canApprove: boolean;
  viewerId: number;
}) {
  return (
    <Card className="!p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-[var(--ink-900)]">{group.vendorName}</span>
        <span className="text-xs tabular-nums text-[var(--ink-500)]">{formatMoney(group.totalPending)} open</span>
      </div>

      <ul className="divide-y divide-[var(--border)] text-sm">
        {group.invoices.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} canApprove={canApprove} viewerId={viewerId} />
        ))}
      </ul>
    </Card>
  );
}

function InvoiceRow({ inv, canApprove, viewerId }: { inv: PendingInvoiceView; canApprove: boolean; viewerId: number }) {
  const [isBusy, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDraft = inv.status === "draft";
  const ownInvoice = inv.createdByEmployeeId === viewerId;

  function run(action: () => Promise<{ error: string | null } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && result.error) setError(result.error);
    });
  }

  if (editing) {
    return (
      <li className="py-2">
        <EditInvoiceForm
          invoiceId={inv.id}
          invoiceNumber={inv.invoiceNumber}
          description={inv.description}
          amount={inv.amount}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-[var(--ink-900)] flex items-center gap-1.5 flex-wrap">
            #{inv.invoiceNumber} <span className="text-[var(--ink-500)] font-normal">· {inv.categoryName}</span>
            {isDraft ? <Badge tone="neutral">Draft</Badge> : <Badge tone="primary">Ready</Badge>}
          </div>
          {inv.description && <div className="text-[var(--ink-500)] text-xs">{inv.description}</div>}
          <div className="text-[var(--ink-500)] opacity-75 text-xs">
            {inv.receivedDate} · logged by {inv.createdByName}
            {!isDraft && inv.readyByName ? ` · approved by ${inv.readyByName}` : ""}
          </div>
          {/* Photos (2026-09-05). Zero is stated, not left blank: this
              list is walked against the paper bills, so "no picture" is
              something the approver needs to see. It warns and nothing
              more — approving without a photo stays allowed (Oliver's
              call), because a dead camera must never stop the week. */}
          <InvoicePhotosButton
            invoiceId={inv.id}
            label={
              inv.photoCount === 0
                ? `Add a photo of invoice ${inv.invoiceNumber}`
                : `${inv.photoCount} photo${inv.photoCount === 1 ? "" : "s"} of invoice ${inv.invoiceNumber}`
            }
            className={`inline-flex items-center gap-1 text-xs underline mt-0.5 ${
              inv.photoCount > 0
                ? "text-[var(--ink-500)] hover:text-[var(--ink-900)]"
                : "text-[var(--warning-700)] hover:brightness-90"
            } ${TAP_TARGET_PAD}`}
          >
            {inv.photoCount === 0 ? (
              <>
                <AlertTriangleIcon width={12} height={12} aria-hidden="true" />
                No photo
              </>
            ) : (
              `${inv.photoCount} photo${inv.photoCount === 1 ? "" : "s"}`
            )}
          </InvoicePhotosButton>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(inv.amount)}</span>
          {isDraft ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] text-xs underline ${TAP_TARGET_PAD}`}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => run(() => deleteDraftInvoice(inv.id))}
                className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
                aria-label={`Remove invoice ${inv.invoiceNumber}`}
              >
                <XIcon width={16} height={16} />
              </button>
              {/* The approve control renders only for approvers looking at
                  someone ELSE's invoice — an approver's own drafts show
                  the reason instead of a button that would only error. */}
              {canApprove &&
                (ownInvoice ? (
                  <span className="text-xs text-[var(--ink-500)] max-w-[9rem]">
                    Yours — someone else approves it
                  </span>
                ) : (
                  <Button type="button" size="sm" variant="secondary" disabled={isBusy} onClick={() => run(() => approveInvoice(inv.id))}>
                    Approve
                  </Button>
                ))}
            </>
          ) : (
            canApprove && (
              <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={() => run(() => unapproveInvoice(inv.id))}>
                Unlock
              </Button>
            )
          )}
        </div>
      </div>
      {error && <div className="text-xs text-[var(--danger-700)] mt-1">{error}</div>}
    </li>
  );
}
