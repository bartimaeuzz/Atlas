import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadUpcomingLeaveRequests } from "@/lib/schedule/loadLeaveRequests";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { CancelLeaveButton } from "./CancelLeaveButton";
import { DecideLeaveButtons } from "./DecideLeaveButtons";
import { MarkSeenOnMount } from "../MarkSeenOnMount";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "success",
  denied: "danger",
};

/** Manager-facing leave inbox (2026-08-16, Schedule Planner Phase D;
 * approval flow added 2026-08-24 — Oliver reversed the original
 * no-approval design). Every manager tier can see this page; only
 * viewers holding SCHEDULE_MANAGE get the Approve/Deny controls, since
 * the person who runs the Weekly Plan is the person who rules on leave.
 * Pending AND approved leave both flag overlapping Weekly Plan slots as
 * needing coverage; denied leave flags nothing. */
export default async function LeavePage() {
  const [requests, canDecide] = await Promise.all([
    loadUpcomingLeaveRequests(businessTodayIso()),
    hasCapability("SCHEDULE_MANAGE"),
  ]);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <MarkSeenOnMount section="leave_requests" />
      <Link href="/schedule" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Schedule
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Leave requests</h1>
      <p className="text-[var(--ink-500)] text-sm mb-6">
        {canDecide
          ? pendingCount > 0
            ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} waiting for your decision. Pending and approved leave both flag the Weekly Plan for coverage.`
            : "Nothing waiting for a decision. Pending and approved leave both flag the Weekly Plan for coverage."
          : "Every upcoming or currently-active leave. Approving and denying is done by whoever manages the schedule."}
      </p>

      {requests.length === 0 ? (
        <p className="text-sm text-[var(--ink-400)] border border-[var(--border)] rounded-[var(--radius-md)] p-4">
          No upcoming leave logged.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm">
          {requests.map((r) => (
            <li key={r.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {r.employeeName}
                  <span className="text-[var(--ink-500)] font-normal">
                    {r.startDate}
                    {r.endDate !== r.startDate ? ` to ${r.endDate}` : ""}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>
                    {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : "Denied"}
                  </Badge>
                </div>
                {r.note && <div className="text-[var(--ink-500)] text-xs mt-0.5">{r.note}</div>}
                <div className="text-[var(--ink-400)] text-xs mt-0.5">
                  logged {r.loggedAt.slice(0, 10)}
                  {r.status !== "pending" && r.decidedByName ? ` · ${r.status} by ${r.decidedByName}` : ""}
                </div>
              </div>
              {canDecide && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <DecideLeaveButtons requestId={r.id} employeeName={r.employeeName} status={r.status} />
                  <CancelLeaveButton requestId={r.id} employeeName={r.employeeName} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
