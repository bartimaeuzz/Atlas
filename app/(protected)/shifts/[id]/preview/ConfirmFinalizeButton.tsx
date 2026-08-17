"use client";

import { useActionState } from "react";
import { confirmFinalize, type ClosingReportActionState } from "@/lib/actions/shift";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: ClosingReportActionState = { error: null };

/** The single most consequential action in the whole flow — locks the
 * shift permanently. Uses the brand color (mor hom indigo), the one place
 * in the app brand is meant for besides the logo, per the 2026-08-15
 * brand-restraint rule (project_atlas_ui_design memory). */
export function ConfirmFinalizeButton({ shiftId }: { shiftId: number }) {
  const [state, formAction, isPending] = useActionState(confirmFinalize, initialState);

  return (
    <form>
      <input type="hidden" name="shiftId" value={shiftId} />
      {state.error && (
        <div className="mb-4">
          <Banner tone="danger" title="Couldn't finalize — nothing was locked." description={state.error} />
        </div>
      )}
      <Button formAction={formAction} loading={isPending} variant="brand">
        {isPending ? "Finalizing…" : "Confirm & Finalize (locks this shift)"}
      </Button>
    </form>
  );
}
