"use client";

import { useActionState } from "react";
import { confirmFinalize, type ClosingReportActionState } from "@/lib/actions/shift";

const initialState: ClosingReportActionState = { error: null };

export function ConfirmFinalizeButton({ shiftId }: { shiftId: number }) {
  const [state, formAction, isPending] = useActionState(confirmFinalize, initialState);

  return (
    <form>
      <input type="hidden" name="shiftId" value={shiftId} />
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line mb-4">
          <div className="font-medium mb-1">Couldn&apos;t finalize — nothing was locked.</div>
          {state.error}
        </div>
      )}
      <button
        formAction={formAction}
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Finalizing…" : "Confirm & Finalize (locks this shift)"}
      </button>
    </form>
  );
}
