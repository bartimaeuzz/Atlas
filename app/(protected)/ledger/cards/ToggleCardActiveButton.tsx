"use client";

import { useState, useTransition } from "react";
import { toggleLedgerCardActive } from "@/lib/actions/card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";

/** 2026-08-21 visual-audit fix: same instant-fire-no-confirmation gap
 * found and fixed on People's identically-shaped Retire control
 * (EmployeeToggleActiveButton.tsx) -- see that file's doc comment for the
 * full story. Reactivate stays instant (it's the undo path, not itself
 * destructive). */
export function ToggleCardActiveButton({ cardId, nextActive }: { cardId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function doToggle() {
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted
      // to "Minified React error #441" in production (2026-08-24 sweep).
      const result = await toggleLedgerCardActive(cardId, nextActive);
      if (result.error) setError(result.error);
      setConfirmOpen(false);
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
          <Banner tone="danger" title="Couldn't update this card" description={error} />
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Retire this card?"
        description="It'll stop showing up when starting a new statement period. Past periods under it stay intact, and you can reactivate it any time from this page."
        confirmLabel="Retire"
        loading={isPending}
        onConfirm={doToggle}
      />
    </>
  );
}
