import Link from "next/link";
import { loadUpcomingLeaveRequests } from "@/lib/schedule/loadLeaveRequests";
import { toIso } from "@/lib/schedule/weekMath";
import { CancelLeaveButton } from "./CancelLeaveButton";
import { MarkSeenOnMount } from "../MarkSeenOnMount";

/** Manager-facing leave inbox/log (2026-08-16, Schedule Planner Phase D)
 * -- Oliver's ask: "a Notification / Log Box that tells the Manager a
 * change is coming or a request has come in." No approve/deny action
 * here on purpose -- a leave request isn't an approval gate (see
 * db/schema.ts's leaveRequests comment), this page exists purely so a
 * manager sees what's coming without being surprised by it later on the
 * Weekly Plan grid (where the same leave shows up as a purple-ringed
 * "needs coverage" flag on any already-generated slot). */
export default async function LeavePage() {
  const requests = await loadUpcomingLeaveRequests(toIso(new Date()));

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <MarkSeenOnMount section="leave_requests" />
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Leave requests</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Every upcoming or currently-active leave, logged by staff themselves once already agreed
        with you. Nothing here needs approval — it&apos;s a log, not a queue.
      </p>

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-4">No upcoming leave logged.</p>
      ) : (
        <ul className="divide-y border rounded text-sm">
          {requests.map((r) => (
            <li key={r.id} className="px-3 py-2.5 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {r.employeeName}
                  <span className="text-neutral-500 font-normal">
                    {" "}
                    — {r.startDate}
                    {r.endDate !== r.startDate ? ` to ${r.endDate}` : ""}
                  </span>
                </div>
                {r.note && <div className="text-neutral-500 text-xs mt-0.5">{r.note}</div>}
                <div className="text-neutral-400 text-[11px] mt-0.5">logged {r.loggedAt.slice(0, 10)}</div>
              </div>
              <CancelLeaveButton requestId={r.id} employeeName={r.employeeName} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
