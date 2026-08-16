import Link from "next/link";
import { loadSwapRequestsForManager, type SwapRequestView } from "@/lib/schedule/loadSwapRequests";
import { toIso } from "@/lib/schedule/weekMath";
import { SwapDecisionButtons } from "./SwapDecisionButtons";
import { MarkSeenOnMount } from "../MarkSeenOnMount";

const STATUS_LABEL: Record<SwapRequestView["status"], string> = {
  open: "Open — unclaimed",
  pending_manager_approval: "Needs your approval",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<SwapRequestView["status"], string> = {
  open: "bg-neutral-100 text-neutral-600",
  pending_manager_approval: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-400",
};

/** Manager-facing shift-swap inbox (Schedule Planner Phase E, 2026-08-16)
 * -- mirrors /schedule/leave's shape (a log, most of it needs no action),
 * except pending_manager_approval rows genuinely need a decision: swaps
 * due <=3 days out don't finalize on acceptance alone, per Oliver's own
 * rule. Everything else here (open/completed/declined) is informational,
 * same "manager notified" spirit as leave requests. */
export default async function SwapsPage() {
  const requests = await loadSwapRequestsForManager(toIso(new Date()));

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <MarkSeenOnMount section="swap_requests" />
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Shift swaps</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Every swap staff have posted or accepted for an upcoming shift. Swaps due more than 3
        days out finalize as soon as a coworker accepts — you&apos;re just notified. Swaps due
        within 3 days need your approval before the shift actually reassigns.
      </p>

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-4">No upcoming swap activity.</p>
      ) : (
        <ul className="divide-y border rounded text-sm">
          {requests.map((r) => (
            <li key={r.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">
                  {r.requestingEmployeeName}
                  <span className="text-neutral-500 font-normal">
                    {" "}
                    — {r.positionName}, {r.date} ({r.period === "Lunch" ? "L" : "D"})
                  </span>
                </div>
                {r.acceptingEmployeeName && (
                  <div className="text-neutral-500 text-xs mt-0.5">
                    {r.status === "declined" ? "Was accepted by" : "Accepted by"} {r.acceptingEmployeeName}
                  </div>
                )}
                {r.note && <div className="text-neutral-500 text-xs mt-0.5">&quot;{r.note}&quot;</div>}
                <span
                  className={"inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded " + STATUS_CLASS[r.status]}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              {r.status === "pending_manager_approval" && <SwapDecisionButtons requestId={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
