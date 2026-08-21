"use client";

import { useState, useTransition } from "react";
import { printChecksForVendors } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TextInput } from "@/components/ui/Field";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** One button, one popup, for printing checks (2026-08-14 follow-up) --
 * replaces the old separate per-vendor "Print check now" buttons and
 * all-or-nothing "Export week's checks" button. Oliver's ask: "when i
 * wanna print, should show popup and allow me to choose which vendor i
 * need to print as well because i want a flexibility to print some but
 * not all or print all." Checking exactly one vendor and printing
 * covers the urgent/instant case (e.g. a maintenance vendor); checking
 * all of them covers the weekly batch -- same popup, same action either
 * way.
 *
 * Restyled onto the design system 2026-08-19 -- this popup used to
 * hand-roll its own `fixed inset-0 bg-black/40 ...` overlay, exactly the
 * duplicate pattern the shared Modal component's own doc comment calls
 * out by name ("found duplicated ad hoc in PrintChecksButton"). Now
 * consumes that shared shell instead. */
export function PrintChecksButton({ groups }: { groups: VendorPendingGroup[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [checkNumbers, setCheckNumbers] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(vendorId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(groups.map((g) => g.vendorId)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handlePrint() {
    setError(null);
    const selections = Array.from(selected).map((vendorId) => ({
      vendorId,
      checkNumber: checkNumbers[vendorId]?.trim() || null,
    }));
    startTransition(async () => {
      try {
        const { paymentIds } = await printChecksForVendors(selections);
        window.location.href = `/ledger/supplier-check/export?paymentIds=${paymentIds.join(",")}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't print checks.");
      }
    });
  }

  if (groups.length === 0) {
    return (
      <div>
        <Button type="button" variant="secondary" size="sm" disabled title="No pending invoices to print">
          Print Checks
        </Button>
        {/* 2026-08-18 visual-audit fix: this used to be explained only by
         * a hover title=, invisible on touch — and this button's disabled
         * state has no other on-screen explanation. */}
        <p className="text-xs text-[var(--ink-500)] mt-1.5">No pending invoices to print.</p>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Print Checks
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} width={448}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-[var(--ink-900)]">Print checks</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
          >
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Choose which vendors to print a check for right now — each check combines all of that
          vendor&apos;s pending invoices. Pick one for an urgent check, or select all for the weekly
          batch.
        </p>
        <div className="flex items-center gap-3 text-xs mb-2">
          <button type="button" onClick={selectAll} className={`underline text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
            Select all
          </button>
          <button type="button" onClick={clearAll} className={`underline text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
            Clear
          </button>
        </div>
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] mb-3 max-h-[45vh] overflow-y-auto">
          {groups.map((g) => (
            <li key={g.vendorId} className="p-2">
              <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(g.vendorId)} onChange={() => toggle(g.vendorId)} className="w-4 h-4" />
                  <span className="text-[var(--ink-900)]">{g.vendorName}</span>
                </span>
                <span className="text-xs tabular-nums text-[var(--ink-500)] shrink-0">
                  {formatMoney(g.totalPending)} · {g.invoices.length} inv.
                </span>
              </label>
              {selected.has(g.vendorId) && (
                <div className="mt-2">
                  <TextInput
                    type="text"
                    value={checkNumbers[g.vendorId] ?? ""}
                    onChange={(e) => setCheckNumbers((prev) => ({ ...prev, [g.vendorId]: e.target.value }))}
                    placeholder="Check # (optional)"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <div className="mb-2">
            <Banner tone="danger" title="Couldn't print checks" description={error} />
          </div>
        )}
        <Button type="button" disabled={selected.size === 0 || isPending} loading={isPending} onClick={handlePrint} className="w-full">
          {isPending
            ? "Printing…"
            : selected.size === 0
              ? "Select vendors to print"
              : `Print ${selected.size} check${selected.size === 1 ? "" : "s"}`}
        </Button>
      </Modal>
    </>
  );
}
