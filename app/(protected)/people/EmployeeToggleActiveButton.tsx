"use client";

import { useState, useTransition } from "react";
import { toggleEmployeeActive } from "@/lib/actions/employees";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** 2026-08-21 visual-audit fix: Retire used to fire instantly on a single
 * click, no confirmation at all -- found live by reproducing it by
 * accident during an audit (one misclick retired the TEST-staff seed
 * account with zero warning). Inconsistent with this exact page's own
 * 2026-08-20 retrofit, which correctly wrapped the sibling Reset-PIN
 * control in ConfirmDialog but left this one untouched. Reactivate stays
 * instant -- it's the undo path for an accidental retire, not itself a
 * destructive action, and gating it too would make correcting a mistake
 * just as risky as making one. */
export function EmployeeToggleActiveButton({ employeeId, active }: { employeeId: number; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function doToggle(nextActive: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleEmployeeActive(employeeId, nextActive);
      if (result.error) setError(result.error);
      setConfirmOpen(false);
    });
  }

  return (
    <span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => (active ? setConfirmOpen(true) : doToggle(true))}
        className={`underline text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
      >
        {isPending ? "…" : active ? "Retire" : "Reactivate"}
      </button>
      {error && <span className="block text-xs text-[var(--danger)] mt-1 max-w-[16rem] text-right">{error}</span>}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Retire this person?"
        description="They'll stop being offered when staffing new shifts. Past shifts they worked stay intact, and you can reactivate them any time from this same page."
        confirmLabel="Retire"
        loading={isPending}
        onConfirm={() => doToggle(false)}
      />
    </span>
  );
}
