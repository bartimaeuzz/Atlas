"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reopenShift } from "@/lib/actions/shift";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Modal } from "@/components/ui/Modal";

/** ADMIN-only reopen control on the Summary page (2026-08-26, Oliver).
 * Danger-tier ritual: a required reason (it goes on the permanent
 * activity log) AND the typed word REOPEN, because this un-posts a
 * locked payroll record. On success the shift is a draft again and the
 * Admin lands on its roster. */
export function ReopenShiftButton({ shiftId, shiftLabel }: { shiftId: number; shiftLabel: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const ready = reason.trim().length > 0 && typed === "REOPEN";

  function confirm() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("shiftId", String(shiftId));
      fd.set("reason", reason);
      const result = await reopenShift(fd);
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/shifts/${shiftId}/roster`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-[var(--danger)] hover:underline min-h-11 px-2"
      >
        Reopen this shift… (Admin)
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId} initialFocus={cancelRef}>
        <div id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-1.5">
          Reopen {shiftLabel}?
        </div>
        <p className="text-sm text-[var(--ink-700)] mb-3">
          This deletes the locked payout snapshot and puts the shift back in draft — the numbers
          recompute from whatever is saved when it is finalized again. Who reopened it, when, and
          why goes on the permanent activity log.
        </p>
        {error && (
          <div className="mb-3">
            <Banner tone="danger" title="Couldn't reopen" description={error} />
          </div>
        )}
        <label className="block text-xs text-[var(--ink-500)] mb-3">
          Why does this shift need reopening? (required — goes on the record)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. CC tip total was typed as 630 instead of 360"
            className="mt-1 w-full border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-2 py-1.5 bg-[var(--card)] text-[var(--ink-900)]"
          />
        </label>
        <label className="block text-xs text-[var(--ink-500)] mb-4">
          Type REOPEN to confirm
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-1 w-full border border-[var(--danger-border)] rounded-[var(--radius-sm)] px-2 py-1.5 bg-[var(--card)] text-[var(--ink-900)]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={!ready} loading={isPending}>
            Reopen shift
          </Button>
        </div>
      </Modal>
    </>
  );
}
