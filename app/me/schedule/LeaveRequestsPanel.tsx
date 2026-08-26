"use client";

import { useActionState, useState, useTransition } from "react";
import { businessTodayIso } from "@/lib/formatDateTime";
import { submitLeaveRequest, deleteLeaveRequest, type LeaveRequestActionState } from "@/lib/actions/leave";
import type { LeaveRequestView } from "@/lib/schedule/loadLeaveRequests";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const initialState: LeaveRequestActionState = { error: null };

/** Self-service leave logging on My Schedule (2026-08-16, Schedule
 * Planner Phase D; approval flow added 2026-08-24 — Oliver reversed the
 * original no-approval design). A new request starts "pending" and a
 * SCHEDULE_MANAGE holder approves/denies it on /schedule/leave; the
 * status chip on each row below is the employee's view of that
 * decision. Pending and approved leave both flag any already-generated
 * Weekly Plan slots that overlap. Form remounts (clearing its fields) whenever
 * `requests.length` changes, same trick AddEntryForm/AddTransactionForm
 * use elsewhere in this app -- a successful submit revalidates the page,
 * which grows the list and remounts the form via its `key`. */
export function LeaveRequestsPanel({ requests }: { requests: LeaveRequestView[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-[var(--ink-900)]">My leave requests</h2>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Hide form" : "+ Request leave"}
        </Button>
      </div>

      {showForm && <LeaveRequestForm key={requests.length} />}

      {requests.length === 0 ? (
        <EmptyState message="No leave logged." />
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] text-sm">
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
  const today = businessTodayIso();

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)] space-y-3 mb-3 text-sm">
      {state.error && <Banner tone="danger" title="Couldn't submit" description={state.error} />}
      <div className="grid grid-cols-2 gap-2">
        <TextInput label="Start date" type="date" name="startDate" required min={today} defaultValue={today} />
        <TextInput label="End date" type="date" name="endDate" required min={today} defaultValue={today} />
      </div>
      <TextInput label="Note (optional)" type="text" name="note" placeholder="e.g. traveling abroad" />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Submitting…" : "Submit"}
      </Button>
    </form>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "success",
  denied: "danger",
};

function LeaveRequestRow({ request }: { request: LeaveRequestView }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)] flex items-center gap-2 flex-wrap">
          {request.startDate}
          {request.endDate !== request.startDate ? ` to ${request.endDate}` : ""}
          <Badge tone={STATUS_TONE[request.status]}>
            {request.status === "pending" ? "Waiting for approval" : request.status === "approved" ? "Approved" : "Denied"}
          </Badge>
        </div>
        {request.note && <div className="text-[var(--ink-500)] text-xs mt-0.5">{request.note}</div>}
        {request.status !== "pending" && request.decidedByName && (
          <div className="text-[var(--ink-400)] text-xs mt-0.5">by {request.decidedByName}</div>
        )}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => deleteLeaveRequest(request.id))}
        className={`text-xs text-[var(--ink-400)] hover:text-[var(--danger-700)] disabled:opacity-50 shrink-0 ${TAP_TARGET_PAD}`}
      >
        Cancel
      </button>
    </li>
  );
}
