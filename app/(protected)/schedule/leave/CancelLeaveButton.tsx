"use client";

import { useTransition } from "react";
import { deleteLeaveRequest } from "@/lib/actions/leave";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** A manager can remove a leave request directly from the log -- e.g.
 * plans changed, or it was logged in error. No confirm dialog (this
 * mirrors the low-friction spirit of the rest of this feature -- it's a
 * log entry, not a locked financial record). */
export function CancelLeaveButton({ requestId, employeeName }: { requestId: number; employeeName: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => deleteLeaveRequest(requestId))}
      className={`text-xs text-[var(--ink-400)] hover:text-[var(--danger-700)] disabled:opacity-50 shrink-0 ${TAP_TARGET_PAD}`}
      aria-label={`Cancel ${employeeName}'s leave request`}
    >
      Cancel
    </button>
  );
}
