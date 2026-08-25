"use client";

import { useState, useTransition } from "react";
import { decideLeaveRequest } from "@/lib/actions/leave";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Approve/Deny controls for the leave inbox (2026-08-24). Rendered
 * only when the viewer holds SCHEDULE_MANAGE — the server action checks
 * again regardless. Pending rows get the two full buttons; decided rows
 * get a single small flip link, so the common state stays uncluttered
 * but a wrong tap is still recoverable without delete-and-resubmit.
 * Errors come back as ActionResult values, not throws — same pattern
 * as SwapDecisionButtons (prod redacts thrown server-action errors). */
export function DecideLeaveButtons({
  requestId,
  employeeName,
  status,
}: {
  requestId: number;
  employeeName: string;
  status: "pending" | "approved" | "denied";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "approved" | "denied") {
    setError(null);
    startTransition(async () => {
      const result = await decideLeaveRequest(requestId, decision);
      if (result.error) setError(result.error);
    });
  }

  if (status === "pending") {
    return (
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={isPending}
            disabled={isPending}
            onClick={() => decide("approved")}
            aria-label={`Approve ${employeeName}'s leave request`}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={isPending}
            onClick={() => decide("denied")}
            aria-label={`Deny ${employeeName}'s leave request`}
          >
            Deny
          </Button>
        </div>
        {error && <Banner tone="danger" title="Couldn't save" description={error} />}
      </div>
    );
  }

  const flipTo = status === "approved" ? ("denied" as const) : ("approved" as const);
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={isPending}
        onClick={() => decide(flipTo)}
        className={`text-xs text-[var(--ink-400)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
        aria-label={`Change ${employeeName}'s leave request to ${flipTo}`}
      >
        {flipTo === "approved" ? "Approve instead" : "Deny instead"}
      </button>
      {error && <Banner tone="danger" title="Couldn't save" description={error} />}
    </div>
  );
}
