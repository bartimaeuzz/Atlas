"use client";

import { useId, useState, useTransition } from "react";
import { markSupplierCheckPaid, voidSupplierCheck } from "@/lib/actions/supplierCheck";
import type { SupplierCheckView, CheckAuditLogEntry } from "@/lib/ledger/loadSupplierCheck";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/Field";
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
  canVoid,
  canMarkPaid,
}: {
  checks: SupplierCheckView[];
  /** SUPPLIER_CHECK_APPROVE — voiding replaced the retired
   * edit-locked-invoice path (2026-08-31 lifecycle rebuild). */
  canVoid: boolean;
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
          canVoid={canVoid}
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
  canVoid,
  canMarkPaid,
}: {
  check: SupplierCheckView;
  open: boolean;
  onToggle: () => void;
  canVoid: boolean;
  canMarkPaid: boolean;
}) {
  const voidTitleId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [auditorCode, setAuditorCode] = useState("");

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted to
      // "Minified React error #441" in production (2026-08-24 sweep).
      const result = await markSupplierCheckPaid(check.id);
      if (result.error) setError(result.error);
    });
  }

  function handleVoid() {
    setError(null);
    startTransition(async () => {
      const result = await voidSupplierCheck({ paymentId: check.id, reason: voidReason, auditorCode });
      if (result.error) {
        setVoidOpen(false);
        setError(result.error);
      } else {
        setVoidOpen(false);
        setVoidReason("");
        setAuditorCode("");
      }
    });
  }

  return (
    <li>
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5 hover:bg-[var(--hover)]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--ink-900)]">{check.vendorName}</span>
          <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(check.totalAmount)}</span>
        </div>
        <div className="text-[var(--ink-500)] text-xs mt-0.5 flex items-center gap-2 flex-wrap">
          <span>
            {check.checkDate}
            {check.checkNumber && ` · check #${check.checkNumber}`} · exported by {check.printedByName}
          </span>
          <CheckStatusBadge status={check.status} />
          {check.singlePerson && <Badge tone="warning">Single-person</Badge>}
          {!check.checkNumber && <Badge tone="neutral">Legacy · no number</Badge>}
        </div>
        <div className="text-[var(--ink-500)] opacity-75 text-[11px] mt-0.5">
          {check.invoices.length} invoice{check.invoices.length === 1 ? "" : "s"} · {open ? "hide detail ▲" : "view detail ▼"}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 bg-[var(--paper)]">
          {/* No per-invoice Edit in here any more (2026-08-31 rebuild):
              nothing on a check is edited by anyone — a mistake voids
              the whole check and its invoices bounce back to Ready. */}
          <ul className="space-y-1.5 mb-2">
            {check.invoices.map((inv) => (
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
                <span className="font-medium tabular-nums text-[var(--ink-900)] shrink-0">{formatMoney(inv.amount)}</span>
              </li>
            ))}
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
              <Banner tone="danger" title="Couldn't update this check" description={error} />
            </div>
          )}
          {check.status === "void" && (
            <p className="text-xs text-[var(--danger-700)] mb-2">
              Voided{check.voidedAt ? ` ${formatDateTime(check.voidedAt)}` : ""}
              {check.voidReason ? ` — "${check.voidReason}"` : ""}. Its number stays burned; the invoices went
              back to Ready.
            </p>
          )}
          {check.singlePerson && check.instantReason && (
            <p className="text-xs text-[var(--warning-700)] mb-2">Instant check — &ldquo;{check.instantReason}&rdquo;</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {check.status !== "void" && (
              <a
                href={`/ledger/supplier-check/export?paymentIds=${check.id}`}
                className={`text-xs underline text-[var(--ink-700)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
              >
                Reprint
              </a>
            )}
            {check.status === "closed" ? (
              <p className="text-xs text-[var(--success-700)]">
                Delivered {check.deliveredAt ? formatDateTime(check.deliveredAt) : ""}
                {check.deliveredByName ? ` · marked by ${check.deliveredByName}` : ""}
              </p>
            ) : check.status === "exported" && canMarkPaid ? (
              <Button type="button" size="sm" disabled={isPending} loading={isPending} onClick={handleMarkPaid}>
                {isPending ? "Marking…" : "Mark as delivered / paid"}
              </Button>
            ) : check.status === "exported" ? (
              /* No button at all rather than a disabled one (2026-08-23).
                 A disabled control still reads as "this is your job, and
                 it's broken"; a sentence says whose job it actually is.
                 Same call as the Settings read-only pass (commit 8e58cac). */
              <p className="text-xs text-[var(--ink-500)]">
                Waiting to be marked delivered — whoever handles the accounts does this step.
              </p>
            ) : null}
            {check.status === "exported" && canVoid && (
              <Button type="button" size="sm" variant="destructive-outline" onClick={() => setVoidOpen(true)} disabled={isPending}>
                Void…
              </Button>
            )}
          </div>

          <Modal open={voidOpen} onClose={() => setVoidOpen(false)} width={420} labelledBy={voidTitleId}>
            <h3 id={voidTitleId} className="text-base font-bold text-[var(--ink-900)] mb-1">
              Void check {check.checkNumber ? `#${check.checkNumber}` : ""}
            </h3>
            <p className="text-xs text-[var(--ink-500)] mb-3">
              The check stays on record forever with its number burned, and its {check.invoices.length} invoice
              {check.invoices.length === 1 ? "" : "s"} bounce back to Ready for correction and a new check. The
              financial auditor&apos;s code signs this off — the same two-person control the whole flow uses.
            </p>
            <div className="space-y-2">
              <TextInput
                type="text"
                label="Why is this check being voided? — goes on the permanent record"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. wrong amount on invoice #4471"
              />
              <TextInput
                type="password"
                inputMode="numeric"
                label="Financial auditor's code"
                value={auditorCode}
                onChange={(e) => setAuditorCode(e.target.value)}
                className="max-w-[160px]"
                placeholder="their PIN"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setVoidOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" loading={isPending} onClick={handleVoid}>
                  {isPending ? "Voiding…" : "Void this check"}
                </Button>
              </div>
            </div>
          </Modal>
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

function CheckStatusBadge({ status }: { status: "exported" | "closed" | "void" }) {
  if (status === "closed") return <Badge tone="success">Closed</Badge>;
  if (status === "void") return <Badge tone="danger">Void</Badge>;
  return <Badge tone="warning">Exported</Badge>;
}
