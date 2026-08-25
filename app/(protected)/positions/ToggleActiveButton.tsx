"use client";

import { useState, useTransition } from "react";
import { togglePositionActive } from "@/lib/actions/positions";
import { Banner, Button, ConfirmDialog } from "@/components/ui";

/** Deactivate / Reactivate a position. ("Retire" -> "Deactivate", Oliver 2026-08-25.)
 *
 * BUG FIX 2026-08-22: this used to call togglePositionActive() directly from
 * onClick with no confirmation — one mis-tap retired a position, and on the
 * phone the control sat inches from Edit. Same defect the 2026-08-21 visual
 * audit fixed on /ledger/vendors' Retire button; this sibling survived that
 * sweep because the sweep was shaped by filename, not by behaviour
 * (introduction.md rule #9).
 *
 * ConfirmDialog, not DangerConfirmDialog: retiring is reversible — the
 * Reactivate path is its own undo, and no shift history is touched. The
 * copy says so explicitly rather than leaving the user to guess whether
 * past shifts are at risk.
 *
 * The try/catch is load-bearing, not defensive boilerplate: the server
 * action throws (requireManagerAction), and a rejected promise inside
 * startTransition would skip setConfirming(false) and leave the dialog
 * open behind a spinner that never stops — a worse dead end than the
 * unconfirmed click this replaced. Caught by the 2026-08-22 scrutinize
 * pass on this very fix.
 */
export function ToggleActiveButton({
  positionId,
  active,
  positionName,
  fullWidth,
}: {
  positionId: number;
  active: boolean;
  positionName: string;
  /** Phone card footers lay Edit + this out as two equal columns. */
  fullWidth?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        await togglePositionActive(positionId, !active);
        setConfirming(false);
      } catch {
        // Plain wording, no error code: the audience is a floor manager on
        // a phone mid-shift, and nothing was changed, so the only useful
        // instruction is "try again".
        setError("Couldn't save that. Nothing was changed — check your connection and try again.");
      }
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={isPending}
        className={fullWidth ? "w-full" : undefined}
      >
        {active ? "Deactivate" : "Reactivate"}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirm}
        loading={isPending}
        title={active ? `Deactivate ${positionName}?` : `Reactivate ${positionName}?`}
        description={
          active
            ? "It stops appearing when you staff new shifts. Every past shift that used it stays exactly as it is, and you can reactivate it any time."
            : "It starts appearing again when you staff new shifts."
        }
        confirmLabel={active ? "Deactivate position" : "Reactivate position"}
        body={error ? <Banner tone="danger" title={error} /> : undefined}
      />
    </>
  );
}
