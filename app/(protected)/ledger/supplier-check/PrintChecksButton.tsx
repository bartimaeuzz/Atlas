"use client";

import { useState, useTransition } from "react";
import { printChecksForVendors } from "@/lib/actions/supplierCheck";
import type { VendorPendingGroup } from "@/lib/ledger/loadSupplierCheck";

/** One button, one popup, for printing checks (2026-08-14 follow-up) --
 * replaces the old separate per-vendor "Print check now" buttons and
 * all-or-nothing "Export week's checks" button. Oliver's ask: "when i
 * wanna print, should show popup and allow me to choose which vendor i
 * need to print as well because i want a flexibility to print some but
 * not all or print all." Checking exactly one vendor and printing
 * covers the urgent/instant case (e.g. a maintenance vendor); checking
 * all of them covers the weekly batch -- same popup, same action either
 * way. */
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
      <button
        type="button"
        disabled
        className="px-4 py-2 rounded border text-sm text-neutral-400 cursor-not-allowed"
        title="No pending invoices to print"
      >
        Print Checks
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded border text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Print Checks
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full max-h-[85vh] overflow-y-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Print checks</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-neutral-400 hover:text-black text-lg leading-none">
                &times;
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Choose which vendors to print a check for right now -- each check combines all of that
              vendor&apos;s pending invoices. Pick one for an urgent check, or select all for the weekly
              batch.
            </p>
            <div className="flex items-center gap-3 text-xs mb-2">
              <button type="button" onClick={selectAll} className="underline text-neutral-500 hover:text-black">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="underline text-neutral-500 hover:text-black">
                Clear
              </button>
            </div>
            <ul className="divide-y border rounded mb-3">
              {groups.map((g) => (
                <li key={g.vendorId} className="p-2">
                  <label className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={selected.has(g.vendorId)} onChange={() => toggle(g.vendorId)} />
                      {g.vendorName}
                    </span>
                    <span className="text-xs text-neutral-500 shrink-0">
                      ${g.totalPending.toFixed(2)} · {g.invoices.length} inv.
                    </span>
                  </label>
                  {selected.has(g.vendorId) && (
                    <input
                      type="text"
                      value={checkNumbers[g.vendorId] ?? ""}
                      onChange={(e) => setCheckNumbers((prev) => ({ ...prev, [g.vendorId]: e.target.value }))}
                      placeholder="Check # (optional)"
                      className="border rounded px-2 py-1 text-xs w-full mt-2"
                    />
                  )}
                </li>
              ))}
            </ul>
            {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
            <button
              type="button"
              disabled={selected.size === 0 || isPending}
              onClick={handlePrint}
              className="w-full bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              {isPending
                ? "Printing…"
                : selected.size === 0
                  ? "Select vendors to print"
                  : `Print ${selected.size} check${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
