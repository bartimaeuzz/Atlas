"use client";

import { useState, useTransition } from "react";
import { approveSwapRequest, declineSwapRequest } from "@/lib/actions/swap";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Manager Approve/Decline controls for a swap sitting in
 * pending_manager_approval -- the one status that actually needs a human
 * decision here (everything else on this page is just a log, same as
 * /schedule/leave).
 *
 * Retrofitted to the design system 2026-08-23. Before: two bare buttons at
 * `text-xs px-2 py-1` and a raw red <p> for errors, no ui/ imports at all.
 *
 * APPROVE NOW CONFIRMS (Oliver, 2026-08-23). It used to fire on the first
 * click, deliberately, for the low-friction spirit of the rest of this
 * feature. But approving reassigns a real shift to a different person, and
 * the manager on the other end of a mis-tap has to notice and undo it --
 * on a phone, in a row of near-identical entries. The dialog names the two
 * people and the shift, so the thing being confirmed is the thing that
 * happens, not just "are you sure".
 *
 * Decline stays single-click: it leaves the shift exactly where it already
 * is, so a mis-tap costs a conversation, not a wrong roster.
 */
export function SwapDecisionButtons({
  requestId,
  requestingEmployeeName,
  acceptingEmployeeName,
  shiftLabel,
}: {
  requestId: number;
  requestingEmployeeName: string;
  acceptingEmployeeName: string | null;
  /** Human-readable "Host · Mon 2026-08-31 · Dinner" for the dialog. */
  shiftLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Actions return { error } now -- thrown server-action errors get
  // redacted to "Minified React error #441" in production (2026-08-24
  // sweep; see lib/actions/actionResult.ts).
  function run(action: (id: number) => Promise<{ error: string | null }>, then?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action(requestId);
      if (result.error) setError(result.error);
      else if (then) then();
    });
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => setConfirming(true)}>
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={isPending}
          onClick={() => run(declineSwapRequest)}
        >
          Decline
        </Button>
      </div>

      {error && <Banner tone="danger" title="Couldn't do that" description={error} />}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => run(approveSwapRequest, () => setConfirming(false))}
        title="Give this shift to someone else?"
        description={
          acceptingEmployeeName
            ? `${shiftLabel} moves from ${requestingEmployeeName} to ${acceptingEmployeeName}. They'll both see the change on their schedule.`
            : `${shiftLabel} — ${requestingEmployeeName}'s swap will be approved.`
        }
        confirmLabel="Yes, approve the swap"
        loading={isPending}
        body={error ? <Banner tone="danger" title="Couldn't approve" description={error} /> : undefined}
      />
    </div>
  );
}
