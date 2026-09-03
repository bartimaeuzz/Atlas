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
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";
import { formatDayLabel } from "@/lib/format/formatDayLabel";

const initialState: SwapRequestActionState = { error: null };

// "completed", "put_back" and "cancelled"-by-a-manager get a richer,
// name-including label built inline in MyRequestRow below.
const STATUS_LABEL: Partial<Record<SwapRequestView["status"], string>> = {
  open: "Nobody has taken it yet — the shift is still yours",
  cancelled: "Cancelled",
  unclaimed: "Nobody took it — the shift stayed yours",
  // Legacy states, from before the approval gate was deleted 2026-09-03.
  declined: "Manager declined — shift is still yours",
  unresolved: "This one was never settled — ask your manager",
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
  viewerId,
}: {
  swappable: { assignmentId: number; date: string; period: "Lunch" | "Dinner"; positionName: string }[];
  acceptable: SwapRequestView[];
  mine: SwapRequestView[];
  /** `mine` now carries swaps this person TOOK as well as ones they
   * posted, so every row has to know which side of it the reader is on
   * before it can be worded correctly. */
  viewerId: number;
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
          <p className="text-xs text-[var(--ink-500)] mb-1.5">Your swaps</p>
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-sm">
            {mine.map((r) => (
              <MyRequestRow key={r.id} request={r} viewerId={viewerId} />
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
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  if (swappable.length === 0) {
    return (
      <div className="mb-3">
        <EmptyState message="No upcoming published shifts available to offer." />
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)] space-y-3 mb-3 text-sm">
      {state.error && <Banner tone="danger" title="Couldn't post" description={state.error} />}
      <Select label="Which shift?" name="assignmentId" required>
        {swappable.map((s) => (
          <option key={s.assignmentId} value={s.assignmentId}>
            {formatDayLabel(s.date)} · {s.positionName} · {s.period}
          </option>
        ))}
      </Select>
      <TextInput label="Note (optional)" type="text" name="note" placeholder="e.g. doctor's appointment" />
      {/* The failure this prevents is "I posted it, so I'm off the hook"
          (2026-09-03). Posting changes nothing until a coworker takes it,
          and someone who believes otherwise simply does not turn up.
          Stated at the moment of posting, in the second person. */}
      <p className="text-xs text-[var(--ink-700)]">
        Until someone takes it, this shift is still yours. You&apos;ll see their name here when they do.
      </p>
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
            — {request.positionName}, {formatDayLabel(request.date)} · {request.period}
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

function MyRequestRow({ request, viewerId }: { request: SwapRequestView; viewerId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which side of this swap is reading it. A row saying "Erika has it
  // now" is right for the person who gave the shift up and nonsense for
  // Erika, who needs "you have this shift now" (2026-09-03, when this
  // list started carrying swaps the viewer TOOK as well as posted).
  const iTookIt = request.acceptingEmployeeId === viewerId;
  const label = iTookIt
    ? request.status === "completed"
      ? `You took this from ${request.requestingEmployeeName}`
      : request.status === "put_back"
        ? `Your manager put this shift back to ${request.requestingEmployeeName} — you don't have it`
        : request.status === "unresolved"
          ? "This one was never settled — ask your manager"
          : `You took this from ${request.requestingEmployeeName}`
    : request.status === "completed"
      ? `Swapped${request.acceptingEmployeeName ? ` — ${request.acceptingEmployeeName} has it now` : ""}`
      : // A manager reversed it, so the shift is the requester's again.
        // They must not read this as "sorted" — say whose it is now.
        request.status === "put_back"
        ? "Your manager put this shift back — it's yours again"
        : request.status === "pending_manager_approval"
          ? `Taken by ${request.acceptingEmployeeName} — waiting on a manager (old request)`
          : request.status === "cancelled" && request.cancelledByName
            ? `Cancelled by ${request.cancelledByName} (manager)`
            : STATUS_LABEL[request.status] ?? request.status;

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {request.positionName}
          <span className="text-[var(--ink-500)] font-normal">
            {" "}
            — {formatDayLabel(request.date)} · {request.period}
          </span>
        </div>
        <div className="text-[var(--ink-500)] text-xs mt-0.5">{label}</div>
        {/* The manager's reason, verbatim (2026-08-30, Oliver: staff must
            see why and by whom) -- this line IS the notification, so it
            renders as a statement to the person, not a muted footnote. */}
        {/* A manager's reason, shown verbatim: this IS the notification.
            Written on a manager cancel and on a put-back, and Atlas has no
            other channel to reach the staff member. */}
        {(request.status === "cancelled" || request.status === "put_back") && request.cancelReason && (
          <div className="text-[var(--ink-700)] text-xs mt-0.5">
            {request.cancelledByName ? `${request.cancelledByName}: ` : ""}
            &ldquo;{request.cancelReason}&rdquo;
          </div>
        )}
        {request.note && <div className="text-[var(--ink-400)] text-xs mt-0.5">&quot;{request.note}&quot;</div>}
        {error && <div className="text-[var(--danger-700)] text-xs mt-0.5">{error}</div>}
      </div>
      {/* A real Button, not a grey text link (Oliver, 2026-08-25: the old
          text-link Cancel was unusable on his phone). Mirrors AcceptableRow's
          Accept: full 36px+ target, visible affordance, and the { error }
          result is now surfaced instead of discarded — a failed cancel used
          to look identical to a dead button. */}
      {request.status === "open" && !iTookIt && (
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
