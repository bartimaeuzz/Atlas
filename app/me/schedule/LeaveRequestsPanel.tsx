"use client";

import { useActionState, useState, useTransition } from "react";
import { submitLeaveRequest, deleteLeaveRequest, type LeaveRequestActionState } from "@/lib/actions/leave";
import type { LeaveRequestView } from "@/lib/schedule/loadLeaveRequests";
import { toIso } from "@/lib/schedule/weekMath";

const initialState: LeaveRequestActionState = { error: null };

/** Self-service leave logging on My Schedule (2026-08-16, Schedule
 * Planner Phase D). No approval step -- confirmed with Oliver: by the
 * time an employee submits this, they've already told the manager
 * informally, this just pushes it into the manager's log/calendar (see
 * /schedule/leave) and flags any already-generated Weekly Plan slots
 * that overlap it. Form remounts (clearing its fields) whenever
 * `requests.length` changes, same trick AddEntryForm/AddTransactionForm
 * use elsewhere in this app -- a successful submit revalidates the page,
 * which grows the list and remounts the form via its `key`. */
export function LeaveRequestsPanel({ requests }: { requests: LeaveRequestView[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">My leave requests</h2>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="text-xs text-neutral-500 hover:text-black underline">
          {showForm ? "Hide form" : "+ Request leave"}
        </button>
      </div>

      {showForm && <LeaveRequestForm key={requests.length} />}

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-3">No leave logged.</p>
      ) : (
        <ul className="divide-y border rounded text-sm">
          {requests.map((r) => (
            <LeaveRequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeaveRequestForm() {
  const [state, formAction, isPending] = useActionState(submitLeaveRequest, initialState);

  return (
    <form action={formAction} className="border rounded p-3 bg-neutral-50 space-y-2 mb-3 text-sm">
      {state.error && <p className="text-red-600">{state.error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-neutral-500 mb-1 text-xs">Start date</span>
          <input type="date" name="startDate" required defaultValue={toIso(new Date())} className="border rounded px-2 py-2 text-sm w-full" />
        </label>
        <label className="block">
          <span className="block text-neutral-500 mb-1 text-xs">End date</span>
          <input type="date" name="endDate" required defaultValue={toIso(new Date())} className="border rounded px-2 py-2 text-sm w-full" />
        </label>
      </div>
      <label className="block">
        <span className="block text-neutral-500 mb-1 text-xs">Note (optional)</span>
        <input type="text" name="note" placeholder="e.g. traveling abroad" className="border rounded px-2 py-2 text-sm w-full" />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

function LeaveRequestRow({ request }: { request: LeaveRequestView }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium">
          {request.startDate}
          {request.endDate !== request.startDate ? ` to ${request.endDate}` : ""}
        </div>
        {request.note && <div className="text-neutral-500 text-xs mt-0.5">{request.note}</div>}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => deleteLeaveRequest(request.id))}
        className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50 shrink-0"
      >
        Cancel
      </button>
    </li>
  );
}
