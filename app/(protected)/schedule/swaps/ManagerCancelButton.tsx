"use client";

import { useState, useTransition } from "react";
import { managerCancelSwapRequest } from "@/lib/actions/swap";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/** Manager cancel for an open / pending swap request (2026-08-30,
 * Oliver's call, made when the danger-zone delete gate exposed that an
 * OPEN request had no manager-side resolution at all — the requester was
 * the only person who could withdraw it).
 *
 * The reason field is not optional ceremony: it IS the notification. The
 * requester sees exactly this text, with the manager's name, on their My
 * Schedule panel — Atlas has no other channel to reach them. So the
 * button stays disabled until a reason exists (error prevention over
 * error messages), and the label under the field says who will read it,
 * so what gets typed is written to a person, not to a log. */
export function ManagerCancelButton({
  requestId,
  requestingEmployeeName,
}: {
  requestId: number;
  requestingEmployeeName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");

  if (!expanded) {
    return (
      <Button type="button" size="sm" variant="destructive-outline" onClick={() => setExpanded(true)}>
        Cancel request…
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 w-full sm:w-64">
      <label className="block">
        <span className="block text-xs font-medium text-[var(--ink-700)] mb-1">
          Why? {requestingEmployeeName} will see this.
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. schedule for that week is being redone"
          className="w-full border border-[var(--border-strong)] rounded-[var(--radius-md)] px-2 py-1.5 text-base bg-[var(--card)] focus:border-[var(--primary)]"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={reason.trim() === ""}
          loading={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              // Return-value error -- thrown server-action errors get
              // redacted in production (2026-08-24 sweep).
              const result = await managerCancelSwapRequest(requestId, reason);
              if (result.error) setError(result.error);
            })
          }
        >
          Cancel their request
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setExpanded(false)}>
          Keep it
        </Button>
      </div>
      {error && <Banner tone="danger" title="Couldn't cancel" description={error} />}
    </div>
  );
}
