"use client";

import { useState, useTransition } from "react";
import { approveSwapRequest, declineSwapRequest } from "@/lib/actions/swap";

/** Manager Approve/Decline controls for a swap sitting in
 * pending_manager_approval -- the one status that actually needs a
 * human decision here (everything else on this page is just a log, same
 * as /schedule/leave). No confirm dialog on Approve (mirrors the rest of
 * this feature's low-friction spirit); errors from the action (e.g. the
 * underlying shift got finalized in the meantime) surface inline rather
 * than silently failing. */
export function SwapDecisionButtons({ requestId }: { requestId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: number) => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action(requestId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(approveSwapRequest)}
          className="text-xs px-2 py-1 rounded bg-black text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(declineSwapRequest)}
          className="text-xs px-2 py-1 rounded border text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
      {error && <p className="text-xs text-red-600 max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
