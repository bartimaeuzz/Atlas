"use client";

import { useState, useTransition } from "react";
import { deleteShift } from "@/lib/actions/shift";
import { LinkButton } from "@/components/ui/Button";
import { DangerConfirmDialog } from "@/components/ui/DangerConfirmDialog";

/** Roster footer controls (2026-08-25, Oliver: "add back button and
 * delete shift button and save button"). The middle ask is deliberately
 * a "Done" that goes back to the month: this page saves every change the
 * moment it happens, so a Save button would lie about unsaved work --
 * the locked convention is "immediate-save surfaces get Done editing,
 * never Save/Cancel" (2026-08-25 design conventions). Delete is the
 * danger tier: typed-word confirm, draft shifts only (the server refuses
 * finalized ones regardless -- a locked payroll record is not deletable). */
export function RosterFooterActions({ shiftId, monthHref, shiftLabel }: { shiftId: number; monthHref: string; shiftLabel: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <LinkButton href={monthHref} variant="secondary">
        Done — back to month
      </LinkButton>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-[var(--danger)] hover:underline min-h-11 px-2"
      >
        Delete shift…
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}

      <DangerConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          startTransition(async () => {
            const fd = new FormData();
            fd.set("shiftId", String(shiftId));
            const result = await deleteShift(fd);
            // On success the action redirects and this never runs.
            if (result?.error) {
              setError(result.error);
              setConfirming(false);
            }
          })
        }
        title="Delete this shift?"
        description={`This permanently deletes ${shiftLabel} — the roster, any saved closing-report numbers, and today's attendance marks. There is no undo. Type DELETE to confirm.`}
        confirmLabel="Delete shift"
        loading={isPending}
      />
    </div>
  );
}
