"use client";

import { useState, useTransition } from "react";
import { markSupplierCheckPaid } from "@/lib/actions/supplierCheck";
import type { SupplierCheckView, CheckAuditLogEntry } from "@/lib/ledger/loadSupplierCheck";
import { EditInvoiceForm } from "./EditInvoiceForm";
import { EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";
import { formatDateTime } from "@/lib/formatDateTime";

/** The holistic checks table (2026-08-14 restructure, replaces v46's
 * "Recent payments" list) -- every check ever printed, most recent
 * first, click a row to expand which invoices it combined. Printed
 * checks get a "Mark as paid / delivered" action; paid checks show who
 * marked them and when. Every check (Printed OR Paid) also gets a
 * "Reprint" link (2026-08-14 follow-up) -- clicking "Print check" in the
 * app generates the check record and the .xlsx, but that's not the same
 * as it actually coming out of a physical printer. Oliver's own words:
 * "even i hit print check now or not it does not mean i actually print
 * it." Reprint just re-downloads the same already-generated check via
 * the export route -- no mutation, safe to click any number of times. */
export function ChecksTable({
  checks,
  canEditLockedInvoices,
  canMarkPaid,
}: {
  checks: SupplierCheckView[];
  canEditLockedInvoices: boolean;
  canMarkPaid: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (checks.length === 0) {
    return <EmptyState message="No checks printed yet." />;
  }

  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm bg-[var(--card)]">
      {checks.map((c) => (
        <CheckRow
          key={c.id}
          check={c}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          canEditLockedInvoices={canEditLockedInvoices}
          canMarkPaid={canMarkPaid}
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
  canMarkPaid,
}: {
  check: SupplierCheckView;
  open: boolean;
  onToggle: () => void;
  canEditLockedInvoices: boolean;
  canMarkPaid: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted to
      // "Minified React error #441" in production (2026-08-24 sweep).
      const result = await markSupplierCheckPaid(check.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <li>
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5 hover:bg-[var(--paper)]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--ink-900)]">{check.vendorName}</span>
          <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(check.totalAmount)}</span>
        </div>
        <div className="text-[var(--ink-500)] text-xs mt-0.5 flex items-center gap-2 flex-wrap">
          <span>
            {check.checkDate}
            {check.checkNumber && ` · check #${check.checkNumber}`} · printed by {check.printedByName}
          </span>
          <CheckStatusBadge status={check.status} />
        </div>
        <div className="text-[var(--ink-500)] opacity-75 text-[11px] mt-0.5">
          {check.invoices.length} invoice{check.invoices.length === 1 ? "" : "s"} · {open ? "hide detail ▲" : "view detail ▼"}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 bg-[var(--paper)]">
          <ul className="space-y-1.5 mb-2">
            {check.invoices.map((inv) =>
              editingInvoiceId === inv.id ? (
                <li key={inv.id} className="border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-1.5">
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
                  className="flex items-start justify-between text-xs border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-1.5"
                >
                  <div>
                    <div className="font-medium text-[var(--ink-900)]">
                      #{inv.invoiceNumber} <span className="text-[var(--ink-500)] font-normal">· {inv.categoryName}</span>
                    </div>
                    {inv.description && <div className="text-[var(--ink-500)]">{inv.description}</div>}
                    <div className="text-[var(--ink-500)] opacity-75">received {inv.receivedDate}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(inv.amount)}</span>
                    {canEditLockedInvoices && (
                      <button
                        type="button"
                        onClick={() => setEditingInvoiceId(inv.id)}
                        className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
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
              <summary className="text-[11px] text-[var(--ink-500)] cursor-pointer hover:text-[var(--ink-900)]">
                History ({check.auditLog.length})
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {check.auditLog.map((entry) => (
                  <HistoryEntry key={entry.id} entry={entry} />
                ))}
              </ul>
            </details>
          )}
          {error && (
            <div className="mb-2">
              <Banner tone="danger" title="Couldn't mark paid" description={error} />
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={`/ledger/supplier-check/export?paymentIds=${check.id}`}
              className={`text-xs underline text-[var(--ink-700)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
            >
              Reprint
            </a>
            {check.status === "paid" ? (
              <p className="text-xs text-[var(--success-700)]">
                Delivered {check.deliveredAt ? formatDateTime(check.deliveredAt) : ""}
                {check.deliveredByName ? ` · marked by ${check.deliveredByName}` : ""}
              </p>
            ) : canMarkPaid ? (
              <Button type="button" size="sm" disabled={isPending} loading={isPending} onClick={handleMarkPaid}>
                {isPending ? "Marking…" : "Mark as paid / delivered"}
              </Button>
            ) : (
              /* No button at all rather than a disabled one (2026-08-23).
                 A disabled control still reads as "this is your job, and
                 it's broken"; a sentence says whose job it actually is.
                 Same call as the Settings read-only pass (commit 8e58cac). */
              <p className="text-xs text-[var(--ink-500)]">
                Waiting to be marked paid — whoever handles the accounts does this step.
              </p>
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
  const when = formatDateTime(entry.createdAt);

  if (entry.action === "PRINTED_CHECK") {
    const d = entry.details as { checkNumber: string | null; totalAmount: number; invoiceIds: number[] };
    return (
      <li className="text-[11px] text-[var(--ink-500)] border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-0">
        <span className="font-medium text-[var(--ink-700)]">Printed</span> by {entry.performedByName} · {when}
        {d.checkNumber && ` · check #${d.checkNumber}`} · {formatMoney(d.totalAmount)} · {d.invoiceIds.length} invoice
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
  if (d.amountBefore !== d.amountAfter) changes.push(`amount ${formatMoney(d.amountBefore)} → ${formatMoney(d.amountAfter)}`);
  if (d.invoiceNumberBefore !== d.invoiceNumberAfter) changes.push(`invoice # ${d.invoiceNumberBefore} → ${d.invoiceNumberAfter}`);
  if (d.descriptionBefore !== d.descriptionAfter) changes.push("description changed");

  return (
    <li className="text-[11px] text-[var(--ink-500)] border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-0">
      <span className="font-medium text-[var(--ink-700)]">Edited</span> by {entry.performedByName} · {when}
      {changes.length > 0 && ` · ${changes.join(", ")}`}
      {entry.reason && <div className="text-[var(--ink-500)] opacity-75 italic">&ldquo;{entry.reason}&rdquo;</div>}
    </li>
  );
}

function CheckStatusBadge({ status }: { status: "printed" | "paid" }) {
  if (status === "paid") return <Badge tone="success">Paid</Badge>;
  return <Badge tone="warning">Printed</Badge>;
}
