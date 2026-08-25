import { loadSwapRequestsForManager, type SwapRequestView } from "@/lib/schedule/loadSwapRequests";
import { toIso, weekStartFor } from "@/lib/schedule/weekMath";
import { formatDayLabel } from "@/lib/format/formatDayLabel";
import { SwapDecisionButtons } from "./SwapDecisionButtons";
import { MarkSeenOnMount } from "../MarkSeenOnMount";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

const STATUS_LABEL: Record<SwapRequestView["status"], string> = {
  open: "Open — nobody has taken it",
  pending_manager_approval: "Needs your approval",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Tone per status, replacing the raw bg-green-100/text-green-800 pairs
 * this page used before the 2026-08-23 retrofit. `primary` for the one
 * status that needs an action, so the row that wants something from you
 * is the row that stands out. */
const STATUS_TONE: Record<SwapRequestView["status"], BadgeTone> = {
  open: "neutral",
  pending_manager_approval: "primary",
  completed: "success",
  declined: "danger",
  cancelled: "neutral",
};

/** Manager-facing shift-swap inbox (Schedule Planner Phase E, 2026-08-16)
 * -- mirrors /schedule/leave's shape (a log, most of it needs no action),
 * except pending_manager_approval rows genuinely need a decision: swaps
 * due <=3 days out don't finalize on acceptance alone, per Oliver's own
 * rule. Everything else here (open/completed/declined) is informational,
 * same "manager notified" spirit as leave requests.
 *
 * Design-system retrofit 2026-08-23. This file had zero components/ui
 * imports and drew its own status pills out of raw Tailwind palette
 * colours. Three things changed beyond swapping in the primitives:
 *
 *  - Dates read "Mon 2026-08-31" via formatDayLabel, not the bare ISO
 *    string. Oliver asked for exactly this elsewhere: "it easier for human
 *    to scan through thousands of data."
 *  - The period is spelled "Lunch"/"Dinner" instead of "(L)"/"(D)". A
 *    single parenthesised letter is a lookup, and the audience for this
 *    app should not have to learn one.
 *  - Rows needing a decision come first. This is an inbox; the two rows
 *    that want something from you should not be somewhere in a list of
 *    twenty that do not.
 */
export default async function SwapsPage() {
  const [requests, canDecide] = await Promise.all([
    loadSwapRequestsForManager(toIso(new Date())),
    hasCapability("SCHEDULE_MANAGE"),
  ]);

  // Needs-approval first, then the log in the order the loader gave us.
  const needsDecision = requests.filter((r) => r.status === "pending_manager_approval");
  const rest = requests.filter((r) => r.status !== "pending_manager_approval");

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8">
      <MarkSeenOnMount section="swap_requests" />

      <LinkButton href="/schedule" variant="ghost" size="sm">
        ← Schedule
      </LinkButton>

      <div className="mt-2">
        <PageHeader
          title="Shift swaps"
          description={
            canDecide
              ? "Every swap staff have posted or accepted for an upcoming shift. Swaps more than 3 days away finalize as soon as a coworker accepts — you're just told. Swaps within 3 days need your approval before the shift actually changes hands."
              : "Every swap staff have posted or accepted for an upcoming shift. Swaps within 3 days of the shift are approved by whoever manages the schedule."
          }
        />
      </div>

      {requests.length === 0 ? (
        <EmptyState message="No upcoming swap activity." />
      ) : (
        <div className="space-y-2">
          {[...needsDecision, ...rest].map((r) => (
            <SwapRow key={r.id} request={r} canDecide={canDecide} />
          ))}
        </div>
      )}
    </main>
  );
}

function SwapRow({ request: r, canDecide }: { request: SwapRequestView; canDecide: boolean }) {
  const shiftLabel = `${r.positionName} · ${formatDayLabel(r.date)} · ${r.period}`;
  // Deciding is SCHEDULE_MANAGE-only (2026-08-24) — other managers see
  // the inbox but not the buttons; the server action checks again anyway.
  const needsDecision = r.status === "pending_manager_approval" && canDecide;

  return (
    <div
      className={
        "rounded-[var(--radius-lg)] border p-3 sm:p-4 bg-[var(--card)] " +
        (needsDecision ? "border-[var(--primary-border)]" : "border-[var(--border)]")
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          {/* "Erika → Meji" (Oliver, 2026-08-25): the direction of the hand-off
              is the headline, not a sub-line. Declined/cancelled keep the plain
              name — no transfer happened, an arrow would claim one did. */}
          <div className="font-medium text-[var(--ink-900)]">
            {r.acceptingEmployeeName && (r.status === "completed" || r.status === "pending_manager_approval") ? (
              <>
                {r.requestingEmployeeName}
                <span className="text-[var(--ink-400)]" aria-hidden>
                  {" "}
                  &rarr;{" "}
                </span>
                <span className="sr-only"> to </span>
                {r.acceptingEmployeeName}
              </>
            ) : (
              r.requestingEmployeeName
            )}
          </div>
          <div className="text-sm text-[var(--ink-700)] mt-0.5">{shiftLabel}</div>

          {r.acceptingEmployeeName && r.status === "declined" && (
            <div className="text-xs text-[var(--ink-500)] mt-1">Was accepted by {r.acceptingEmployeeName}</div>
          )}
          {r.note && <div className="text-xs text-[var(--ink-500)] mt-1 italic">&ldquo;{r.note}&rdquo;</div>}

          <div className="mt-2 flex items-center gap-3">
            <Badge tone={STATUS_TONE[r.status]}>
              {r.status === "pending_manager_approval" && !canDecide
                ? "Awaiting approval"
                : STATUS_LABEL[r.status]}
            </Badge>
            {/* Jump straight to the slot on the Weekly Plan (Oliver,
                2026-08-25) — day param preselects the phone day tab. */}
            <LinkButton
              href={`/schedule/plan?week=${weekStartFor(r.date)}&day=${r.date}`}
              variant="ghost"
              size="sm"
            >
              View shift →
            </LinkButton>
          </div>
        </div>

        {needsDecision && (
          <SwapDecisionButtons
            requestId={r.id}
            requestingEmployeeName={r.requestingEmployeeName}
            acceptingEmployeeName={r.acceptingEmployeeName}
            shiftLabel={shiftLabel}
          />
        )}
      </div>
    </div>
  );
}
