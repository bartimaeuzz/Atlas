"use client";

import { useId, useState, useTransition } from "react";
import { exportChecks } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD, ICON_TAP_TARGET_44 } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** Export Ready invoices as checks (2026-08-31 lifecycle rebuild —
 * replaces PrintChecksButton). Two deliberate changes from the old
 * popup, both from the approved spec:
 *  - selection is PER INVOICE, not per vendor: one questionable invoice
 *    can be held back without blocking the vendor's other bills. One
 *    check per vendor still combines that vendor's selected invoices.
 *  - no manual check-number fields: Atlas's own forward-only sequence
 *    (Settings) assigns numbers atomically at export.
 * Only READY invoices appear here at all — drafts haven't been reviewed
 * and can't go on a check. */
export function ExportChecksButton({ groups, sequenceReady }: { groups: VendorPendingGroup[]; sequenceReady: boolean }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const readyGroups = groups
    .map((g) => ({ ...g, invoices: g.invoices.filter((i) => i.status === "ready") }))
    .filter((g) => g.invoices.length > 0);
  const allReadyIds = readyGroups.flatMap((g) => g.invoices.map((i) => i.id));
  const selectedTotal = readyGroups
    .flatMap((g) => g.invoices)
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + i.amount, 0);
  const vendorCount = new Set(
    readyGroups.filter((g) => g.invoices.some((i) => selected.has(i.id))).map((g) => g.vendorId)
  ).size;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    setError(null);
    startTransition(async () => {
      // catch (2026-08-31 visual audit): the documented strand-the-spinner
      // class — a network drop would spin loading={isPending} forever.
      try {
        const { paymentIds, error } = await exportChecks(Array.from(selected));
        if (error) setError(error);
        else window.location.href = `/ledger/supplier-check/export?paymentIds=${paymentIds.join(",")}`;
      } catch {
        setError("Couldn't reach the server — nothing was exported. Try again.");
      }
    });
  }

  // Both real preconditions surface HERE, before any clicking (2026-08-31
  // visual audit: the unset check-number sequence used to be discovered
  // only after selecting invoices and hitting Export).
  if (allReadyIds.length === 0 || !sequenceReady) {
    return (
      <div>
        <Button type="button" variant="secondary" size="sm" disabled>
          Export checks
        </Button>
        <p className="text-xs text-[var(--ink-500)] mt-1.5">
          {!sequenceReady
            ? "Set the next check number in Settings first."
            : "Nothing approved to export yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Export checks
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} width={448} labelledBy={titleId}>
        <div className="flex items-center justify-between mb-3">
          <h3 id={titleId} className="text-base font-bold text-[var(--ink-900)]">
            Export checks
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            /* -mr-2.5 spends the dialog's own 20px padding, so the box
               reaches 44px without the glyph sliding away from the edge. */
            className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] -mr-2.5 ${ICON_TAP_TARGET_44}`}
          >
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Tick the approved invoices to pay now — one check per vendor combines that vendor&apos;s ticked
          invoices. Check numbers come from the sequence in Settings automatically. Anything left
          unticked simply waits.
        </p>
        <div className="flex items-center gap-3 text-xs mb-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(allReadyIds))}
            className={`underline text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
          >
            Select all
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className={`underline text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
            Clear
          </button>
        </div>
        <div className="border border-[var(--border)] rounded-[var(--radius-md)] mb-3 max-h-[45vh] overflow-y-auto divide-y divide-[var(--border)]">
          {readyGroups.map((g) => (
            <div key={g.vendorId} className="p-2">
              <div className="text-xs font-semibold text-[var(--ink-700)] px-1 py-1">{g.vendorName}</div>
              {g.invoices.map((inv) => (
                <label key={inv.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer min-h-11 px-1">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggle(inv.id)}
                      className="size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="text-[var(--ink-900)]">
                      #{inv.invoiceNumber}
                      <span className="text-[var(--ink-500)]"> · {inv.categoryName}</span>
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-[var(--ink-500)] shrink-0">{formatMoney(inv.amount)}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        {error && (
          <div className="mb-2">
            <Banner tone="danger" title="Couldn't export checks" description={error} />
          </div>
        )}
        <Button type="button" disabled={selected.size === 0 || isPending} loading={isPending} onClick={handleExport} className="w-full">
          {isPending
            ? "Exporting…"
            : selected.size === 0
              ? "Tick invoices to export"
              : `Export ${vendorCount} check${vendorCount === 1 ? "" : "s"} · ${formatMoney(selectedTotal)}`}
        </Button>
      </Modal>
    </>
  );
}
