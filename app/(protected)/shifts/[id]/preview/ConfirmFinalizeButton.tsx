"use client";

import { startTransition, useActionState, useState } from "react";
import { confirmFinalize, type ClosingReportActionState } from "@/lib/actions/shift";
import { Button, LinkButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const initialState: ClosingReportActionState = { error: null };

/** The single most consequential action in the whole flow — locks the
 * shift permanently. Uses the brand color (mor hom indigo), the one place
 * in the app brand is meant for besides the logo, per the 2026-08-15
 * brand-restraint rule (project_atlas_ui_design memory).
 *
 * 2026-08-24 (Oliver): the button says just "Finalize"; the consequence
 * moved into a ConfirmDialog ("no edit after confirm"), same shape as the
 * publish-week unlock — a label that carries the warning gets tapped
 * through without reading. A Back button rides beside it for the "numbers
 * look wrong" path, so both answers to "look right?" have a button. */
export function ConfirmFinalizeButton({
  shiftId,
  blockedReason = null,
}: {
  shiftId: number;
  /** Non-null when something must be resolved before this shift can lock
   * (2026-08-29: an off-role person whose tip point nobody has decided).
   * The button is disabled and says why -- but the real gate is server-side
   * in runFinalize, since a disabled button is a hint, not a guarantee. */
  blockedReason?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(confirmFinalize, initialState);
  const [confirming, setConfirming] = useState(false);
  const blocked = blockedReason != null;

  return (
    <>
      {state.error && (
        <div className="mb-4">
          <Banner tone="danger" title="Couldn't finalize — nothing was locked." description={state.error} />
        </div>
      )}
      <div className="flex items-center gap-3">
        {/* Back on the LEFT (Oliver, 2026-08-24) -- matches reading order:
            the retreat before the commit. */}
        <LinkButton href={`/shifts/${shiftId}/closing-report`} variant="secondary">
          ← Back
        </LinkButton>
        <Button
          type="button"
          variant="brand"
          loading={isPending}
          disabled={blocked}
          title={blockedReason ?? undefined}
          onClick={() => setConfirming(true)}
        >
          {isPending ? "Finalizing…" : "Finalize"}
        </Button>
      </div>
      {/* The reason sits beside the control in text, not only in a title
          attribute -- a tooltip is invisible on the phone this is used on. */}
      {blocked && (
        <p className="mt-2 text-sm text-[var(--ink-500)]">{blockedReason}</p>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          const fd = new FormData();
          fd.set("shiftId", String(shiftId));
          // useActionState dispatch outside a form must run in a transition
          // or isPending never updates (same catch as the import commit).
          startTransition(() => formAction(fd));
        }}
        title="Finalize this shift?"
        description="This locks the shift permanently — the roster and closing report can't be edited after you confirm."
        confirmLabel="Finalize"
        loading={isPending}
      />
    </>
  );
}
