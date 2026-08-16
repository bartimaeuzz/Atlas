"use client";

import { useState, useTransition } from "react";
import { markSupplierCheckPaid } from "@/lib/actions/supplierCheck";
import type { SupplierCheckView, CheckAuditLogEntry } from "@/lib/ledger/loadSupplierCheck";
import { EditInvoiceForm } from "./EditInvoiceForm";

/** The holistic checks table (2026-08-14 restructure, replaces v46's
 * "Recent payments" list) -- every check ever printed, most recent
 * first, click a row to expand which invoices it combined. Printed
 * checks get a "Mark as paid / delivered" action; paid checks show who
 * marked them and when. Every check (Printed OR Paid) also gets a
 * "Reprint" link (2026-08-14 follow-up) -- clicking "Print check" in the
 * app generates the check record and the .xlsx, but that's not the same
 * as it actually coming out of a physical printer; Oliver's own words:
 * "even i hit print check now or not it does not mean i actually print
 * it." Reprint just re-downloads the same already-generated check via
 * the export route -- no mutation, safe to click any number of times. */
export function ChecksTable({ checks, canEditLockedInvoices }: { checks: SupplierCheckView[]; canEditLockedInvoices: boolean }) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (checks.length === 0) {
    return <p className="text-sm text-neutral-400 border rounded p-3">No checks printed yet.</p>;
  }

  return (
    <ul className="divide-y border rounded text-sm">
      {checks.map((c) => (
        <CheckRow
          key={c.id}
          check={c}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          canEditLockedInvoices={canEditLockedInvoices}
        />
      ))}
    </ul>
  );
}

function CheckRow({
  check,
  open,
  onToggle,
  canEditLockedInvoices,
}: {
  check: SupplierCheckView;
  open: boolean;
  onToggle: () => void;
  canEditLockedInvoices: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      try {
        await markSupplierCheckPaid(check.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't mark paid.");
      }
    });
  }

  return (
    <li>
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5 hover:bg-neutral-50">
        <div className="flex items-center justify-between">
          <span className="font-medium">{check.vendorName}</span>
          <span className="font-medium">${check.totalAmount.toFixed(2)}</span>
        </div>
        <div className="text-neutral-500 text-xs mt-0.5 flex items-center gap-2 flex-wrap">
          <span>
            {check.checkDate}
            {check.checkNumber && ` · check #${check.checkNumber}`} · printed by {check.printedByName}
          </span>
          <StatusBadge status={check.status} />
        </div>
        <div className="text-neutral-400 text-[11px] mt-0.5">
          {check.invoices.length} invoice{check.invoices.length === 1 ? "" : "s"} · {open ? "hide detail ▲" : "view detail ▼"}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 bg-neutral-50">
          <ul className="space-y-1.5 mb-2">
            {check.invoices.map((inv) =>
              editingInvoiceId === inv.id ? (
                <li key={inv.id} className="border-t pt-1.5 first:border-t-0 first:pt-1.5">
                  <EditInvoiceForm
                    invoiceId={inv.id}
                    invoiceNumber={inv.invoiceNumber}
                    description={inv.description}
                    amount={inv.amount}
                    requireAuditorCode
                    onDone={() => setEditingInvoiceId(null)}
                  />
                </li>
              ) : (
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-medium">${inv.amount.toFixed(2)}</span>
                    {canEditLockedInvoices && (
                      <button
                        type="button"
                        onClick={() => setEditingInvoiceId(inv.id)}
                        className="text-neutral-400 hover:text-black underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </li>
              )
            )}
          </ul>
          {check.auditLog.length > 0 && (
            <details className="mb-2">
              <summary className="text-[11px] text-neutral-500 cursor-pointer hover:text-black">
                History ({check.auditLog.length})
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {check.auditLog.map((entry) => (
                  <HistoryEntry key={entry.id} entry={entry} />
                ))}
              </ul>
            </details>
          )}
          {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={`/ledger/supplier-check/export?paymentIds=${check.id}`}
              className="text-xs underline text-neutral-600 hover:text-black"
            >
              Reprint
            </a>
            {check.status === "paid" ? (
              <p className="text-xs text-green-700">
                Delivered {check.deliveredAt ? new Date(check.deliveredAt).toLocaleString() : ""}
                {check.deliveredByName ? ` · marked by ${check.deliveredByName}` : ""}
              </p>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleMarkPaid}
                className="text-xs bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPending ? "Marking…" : "Mark as paid / delivered"}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** One line of a check's audit trail (2026-08-15) -- see
 * supplierCheckAuditLog's schema comment for what `details` holds per
 * action. Only shows fields that actually changed, so a reprint-free
 * "fixed the description" edit doesn't clutter the line with an
 * unchanged amount. */
function HistoryEntry({ entry }: { entry: CheckAuditLogEntry }) {
  const when = new Date(entry.createdAt).toLocaleString();

  if (entry.action === "PRINTED_CHECK") {
    const d = entry.details as { checkNumber: string | null; totalAmount: number; invoiceIds: number[] };
    return (
      <li className="text-[11px] text-neutral-500 border-t pt-1.5 first:border-t-0 first:pt-0">
        <span className="font-medium text-neutral-700">Printed</span> by {entry.performedByName} · {when}
        {d.checkNumber && ` · check #${d.checkNumber}`} · ${d.totalAmount.toFixed(2)} · {d.invoiceIds.length} invoice
        {d.invoiceIds.length === 1 ? "" : "s"}
      </li>
    );
  }

  const d = entry.details as {
    invoiceNumberBefore: string;
    invoiceNumberAfter: string;
    descriptionBefore: string | null;
    descriptionAfter: string | null;
    amountBefore: number;
    amountAfter: number;
  };
  const changes: string[] = [];
  if (d.amountBefore !== d.amountAfter) changes.push(`amount $${d.amountBefore.toFixed(2)} → $${d.amountAfter.toFixed(2)}`);
  if (d.invoiceNumberBefore !== d.invoiceNumberAfter) changes.push(`invoice # ${d.invoiceNumberBefore} → ${d.invoiceNumberAfter}`);
  if (d.descriptionBefore !== d.descriptionAfter) changes.push("description changed");

  return (
    <li className="text-[11px] text-neutral-500 border-t pt-1.5 first:border-t-0 first:pt-0">
      <span className="font-medium text-neutral-700">Edited</span> by {entry.performedByName} · {when}
      {changes.length > 0 && ` · ${changes.join(", ")}`}
      {entry.reason && <div className="text-neutral-400 italic">&ldquo;{entry.reason}&rdquo;</div>}
    </li>
  );
}

function StatusBadge({ status }: { status: "printed" | "paid" }) {
  if (status === "paid") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">Paid</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Printed</span>;
}
