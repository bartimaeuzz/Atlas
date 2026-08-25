"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createSwapRequest,
  cancelSwapRequest,
  acceptSwapRequest,
  type SwapRequestActionState,
} from "@/lib/actions/swap";
import type { SwapRequestView } from "@/lib/schedule/loadSwapRequests";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/Card";

const initialState: SwapRequestActionState = { error: null };

// Only "open"/"declined"/"cancelled" ever read from here -- "completed"
// and "pending_manager_approval" get a richer, name-including label
// built inline in MyRequestRow below.
const STATUS_LABEL: Partial<Record<SwapRequestView["status"], string>> = {
  open: "Open — waiting for someone to accept",
  declined: "Manager declined — shift is still yours",
  cancelled: "Cancelled",
};

/** Self-service shift-swap board on My Schedule (2026-08-16, Schedule
 * Planner Phase E). Three parts: offer one of your own upcoming shifts,
 * accept an open request from a coworker who holds the same position,
 * and track your own posted requests. Mirrors LeaveRequestsPanel's
 * shape/conventions (collapsible submit form, key-on-length remount to
 * clear the form after a successful submit) rather than inventing a new
 * pattern. */
export function SwapBoardPanel({
  swappable,
  acceptable,
  mine,
}: {
  swappable: { assignmentId: number; date: string; period: "Lunch" | "Dinner"; positionName: string }[];
  acceptable: SwapRequestView[];
  mine: SwapRequestView[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-[var(--ink-900)]">Shift swaps</h2>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Hide form" : "+ Offer a shift"}
        </Button>
      </div>

      {showForm && <OfferSwapForm key={mine.length} swappable={swappable} />}

      {acceptable.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-[var(--ink-500)] mb-1.5">Open requests you can accept</p>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-sm">
            {acceptable.map((r) => (
              <AcceptableRow key={r.id} request={r} />
            ))}
          </ul>
        </div>
      )}

      {mine.length > 0 && (
        <div>
          <p className="text-xs text-[var(--ink-500)] mb-1.5">Your swap requests</p>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-sm">
            {mine.map((r) => (
              <MyRequestRow key={r.id} request={r} />
            ))}
          </ul>
        </div>
      )}

      {acceptable.length === 0 && mine.length === 0 && <EmptyState message="No swap activity right now." />}
    </div>
  );
}

function OfferSwapForm({
  swappable,
}: {
  swappable: { assignmentId: number; date: string; period: "Lunch" | "Dinner"; positionName: string }[];
}) {
  const [state, formAction, isPending] = useActionState(createSwapRequest, initialState);

  if (swappable.length === 0) {
    return (
      <div className="mb-3">
        <EmptyState message="No upcoming published shifts available to offer." />
      </div>
    );
  }

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)] space-y-3 mb-3 text-sm">
      {state.error && <Banner tone="danger" title="Couldn't post" description={state.error} />}
      <Select label="Which shift?" name="assignmentId" required>
        {swappable.map((s) => (
          <option key={s.assignmentId} value={s.assignmentId}>
            {s.date} — {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
          </option>
        ))}
      </Select>
      <TextInput label="Note (optional)" type="text" name="note" placeholder="e.g. doctor's appointment" />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Posting…" : "Post for swap"}
      </Button>
    </form>
  );
}

function AcceptableRow({ request }: { request: SwapRequestView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {request.requestingEmployeeName}
          <span className="text-[var(--ink-500)] font-normal">
            {" "}
            — {request.positionName}, {request.date} ({request.period === "Lunch" ? "L" : "D"})
          </span>
        </div>
        {request.note && <div className="text-[var(--ink-500)] text-xs mt-0.5">&quot;{request.note}&quot;</div>}
        {error && <div className="text-[var(--danger-700)] text-xs mt-0.5">{error}</div>}
      </div>
      <Button
        type="button"
        size="sm"
        loading={isPending}
        className="shrink-0"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            // Return-value error -- thrown server-action errors get redacted
            // to "Minified React error #441" in production (2026-08-24 sweep).
            const result = await acceptSwapRequest(request.id);
            if (result.error) setError(result.error);
          })
        }
      >
        Accept
      </Button>
    </li>
  );
}

function MyRequestRow({ request }: { request: SwapRequestView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label =
    request.status === "pending_manager_approval"
      ? `Accepted by ${request.acceptingEmployeeName} — awaiting manager approval`
      : request.status === "completed"
        ? `Swap completed${request.acceptingEmployeeName ? ` — ${request.acceptingEmployeeName} has it now` : ""}`
        : STATUS_LABEL[request.status] ?? request.status;

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {request.positionName}
          <span className="text-[var(--ink-500)] font-normal">
            {" "}
            — {request.date} ({request.period === "Lunch" ? "L" : "D"})
          </span>
        </div>
        <div className="text-[var(--ink-500)] text-xs mt-0.5">{label}</div>
        {request.note && <div className="text-[var(--ink-400)] text-xs mt-0.5">&quot;{request.note}&quot;</div>}
        {error && <div className="text-[var(--danger-700)] text-xs mt-0.5">{error}</div>}
      </div>
      {/* A real Button, not a grey text link (Oliver, 2026-08-25: the old
          text-link Cancel was unusable on his phone). Mirrors AcceptableRow's
          Accept: full 36px+ target, visible affordance, and the { error }
          result is now surfaced instead of discarded — a failed cancel used
          to look identical to a dead button. */}
      {request.status === "open" && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={isPending}
          className="shrink-0"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await cancelSwapRequest(request.id);
              if (result.error) setError(result.error);
            })
          }
        >
          Cancel
        </Button>
      )}
    </li>
  );
}
