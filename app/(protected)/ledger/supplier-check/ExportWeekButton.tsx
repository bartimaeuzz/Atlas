"use client";

import { useState, useTransition } from "react";
import { printAllPendingChecks } from "@/lib/actions/supplierCheck";

/** The weekly-batch path (2026-08-14) -- Oliver's confirmed real
 * workflow via Aey: "all invoices always get export to check format at
 * the end of the week." Prints a check for every vendor that currently
 * has pending invoices, then downloads one combined .xlsx of everything
 * just printed. */
export function ExportWeekButton({ disabled }: { disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const { paymentIds } = await printAllPendingChecks();
        if (paymentIds.length === 0) return;
        window.location.href = `/ledger/supplier-check/export?paymentIds=${paymentIds.join(",")}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't export.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={disabled || isPending}
        onClick={handleClick}
        className="px-4 py-2 rounded border text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        title={disabled ? "No pending invoices to export" : undefined}
      >
        {isPending ? "Exporting…" : "Export week's checks"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
