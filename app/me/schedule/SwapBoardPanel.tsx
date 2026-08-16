"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createSwapRequest,
  cancelSwapRequest,
  acceptSwapRequest,
  type SwapRequestActionState,
} from "@/lib/actions/swap";
import type { SwapRequestView } from "@/lib/schedule/loadSwapRequests";

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
        <h2 className="text-sm font-medium">Shift swaps</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-neutral-500 hover:text-black underline"
        >
          {showForm ? "Hide form" : "+ Offer a shift"}
        </button>
      </div>

      {showForm && <OfferSwapForm key={mine.length} swappable={swappable} />}

      {acceptable.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-neutral-500 mb-1.5">Open requests you can accept</p>
          <ul className="divide-y border rounded text-sm">
            {acceptable.map((r) => (
              <AcceptableRow key={r.id} request={r} />
            ))}
          </ul>
        </div>
      )}

      {mine.length > 0 && (
        <div>
          <p className="text-xs text-neutral-500 mb-1.5">Your swap requests</p>
          <ul className="divide-y border rounded text-sm">
            {mine.map((r) => (
              <MyRequestRow key={r.id} request={r} />
            ))}
          </ul>
        </div>
      )}

      {acceptable.length === 0 && mine.length === 0 && (
        <p className="text-sm text-neutral-400 border rounded p-3">No swap activity right now.</p>
      )}
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
      <p className="text-sm text-neutral-400 border rounded p-3 mb-3">
        No upcoming published shifts available to offer.
      </p>
    );
  }

  return (
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2 mb-3 text-sm">
      {state.error && <p className="text-red-600">{state.error}</p>}
      <label className="block">
        <span className="block text-neutral-500 mb-1 text-xs">Which shift?</span>
        <select name="assignmentId" required className="border rounded px-2 py-2 text-sm w-full">
          {swappable.map((s) => (
            <option key={s.assignmentId} value={s.assignmentId}>
              {s.date} — {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-neutral-500 mb-1 text-xs">Note (optional)</span>
        <input type="text" name="note" placeholder="e.g. doctor's appointment" className="border rounded px-2 py-2 text-sm w-full" />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Posting…" : "Post for swap"}
      </button>
    </form>
  );
}

function AcceptableRow({ request }: { request: SwapRequestView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium">
          {request.requestingEmployeeName}
          <span className="text-neutral-500 font-normal">
            {" "}
            — {request.positionName}, {request.date} ({request.period === "Lunch" ? "L" : "D"})
          </span>
        </div>
        {request.note && <div className="text-neutral-500 text-xs mt-0.5">&quot;{request.note}&quot;</div>}
        {error && <div className="text-red-600 text-xs mt-0.5">{error}</div>}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await acceptSwapRequest(request.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })
        }
        className="text-xs px-2 py-1 rounded bg-black text-white hover:bg-neutral-700 disabled:opacity-50 shrink-0"
      >
        Accept
      </button>
    </li>
  );
}

function MyRequestRow({ request }: { request: SwapRequestView }) {
  const [isPending, startTransition] = useTransition();
  const label =
    request.status === "pending_manager_approval"
      ? `Accepted by ${request.acceptingEmployeeName} — awaiting manager approval`
      : request.status === "completed"
        ? `Swap completed${request.acceptingEmployeeName ? ` — ${request.acceptingEmployeeName} has it now` : ""}`
        : STATUS_LABEL[request.status] ?? request.status;

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium">
          {request.positionName}
          <span className="text-neutral-500 font-normal">
            {" "}
            — {request.date} ({request.period === "Lunch" ? "L" : "D"})
          </span>
        </div>
        <div className="text-neutral-500 text-xs mt-0.5">{label}</div>
        {request.note && <div className="text-neutral-400 text-xs mt-0.5">&quot;{request.note}&quot;</div>}
      </div>
      {request.status === "open" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => cancelSwapRequest(request.id))}
          className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50 shrink-0"
        >
          Cancel
        </button>
      )}
    </li>
  );
}
