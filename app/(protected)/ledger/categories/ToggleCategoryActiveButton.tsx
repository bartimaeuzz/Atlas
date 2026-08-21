"use client";

import { useState, useTransition } from "react";
import { toggleLedgerCategoryActive } from "@/lib/actions/ledger";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";

/** 2026-08-21 visual-audit fix: same instant-fire-no-confirmation gap
 * found and fixed on People's identically-shaped Retire control
 * (EmployeeToggleActiveButton.tsx) -- see that file's doc comment for the
 * full story. Reactivate stays instant (it's the undo path, not itself
 * destructive). */
export function ToggleCategoryActiveButton({ categoryId, nextActive }: { categoryId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function doToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await toggleLedgerCategoryActive(categoryId, nextActive);
        setConfirmOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update this category.");
        setConfirmOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => (nextActive ? doToggle() : setConfirmOpen(true))}
        className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
      >
        {nextActive ? "Reactivate" : "Retire"}
      </button>
      {error && (
        <div className="mt-1">
          <Banner tone="danger" title="Couldn't update this category" description={error} />
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Retire this category?"
        description="It'll stop showing up when logging new entries. Past entries under it stay intact, and you can reactivate it any time from this page."
        confirmLabel="Retire"
        loading={isPending}
        onConfirm={doToggle}
      />
    </>
  );
}
