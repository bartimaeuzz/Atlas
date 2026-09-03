"use client";

import { useState, useTransition } from "react";
import { putBackSwap } from "@/lib/actions/swap";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/** The manager's control over a completed swap (2026-09-03) — this
 * replaced SwapDecisionButtons when the approval gate was deleted.
 *
 * Undo instead of approve. The old gate asked for a click BEFORE the swap
 * could take effect, which meant an unclicked swap left the schedule
 * asserting the wrong person had the shift; production carried one like
 * that for nine days. This asks for nothing unless something is actually
 * wrong, and gives the same veto: the shift goes back to whoever offered
 * it, until the shift starts.
 *
 * Same shape as ManagerCancelButton on purpose, including the required
 * reason — both staff members read it verbatim on their own My Schedule,
 * and Atlas has no other channel to reach them. Disabled until a reason
 * exists: error prevention over error messages. */
export function PutBackButton({
  requestId,
  requestingEmployeeName,
  acceptingEmployeeName,
}: {
  requestId: number;
  requestingEmployeeName: string;
  acceptingEmployeeName: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");

  if (!expanded) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setExpanded(true)}>
        Put it back…
      </Button>
    );
  }

  const who = acceptingEmployeeName ?? "whoever took it";
  return (
    <div className="flex flex-col items-stretch gap-2 w-full sm:w-64">
      <p className="text-xs text-[var(--ink-700)]">
        The shift goes back to {requestingEmployeeName}. {who} will no longer have it.
      </p>
      <label className="block">
        <span className="block text-xs font-medium text-[var(--ink-700)] mb-1">
          Why? {requestingEmployeeName} and {who} will both see this.
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. need someone with more experience that night"
          className="w-full border border-[var(--border-strong)] rounded-[var(--radius-md)] px-2 py-1.5 text-base bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-border)] focus:border-[var(--primary)]"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={reason.trim() === ""}
          loading={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              // Return-value error -- thrown server-action errors get
              // redacted in production (2026-08-24 sweep).
              const result = await putBackSwap(requestId, reason);
              if (result.error) setError(result.error);
            })
          }
        >
          Put the shift back
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setExpanded(false)}>
          Leave it
        </Button>
      </div>
      {error && <Banner tone="danger" title="Couldn't put it back" description={error} />}
    </div>
  );
}
