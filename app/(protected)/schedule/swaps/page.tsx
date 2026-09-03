import { loadSwapRequestsForManager, type SwapRequestView } from "@/lib/schedule/loadSwapRequests";
import { businessTodayIso } from "@/lib/formatDateTime";
import { weekStartFor, daysBetween } from "@/lib/schedule/weekMath";
import { formatDayLabel } from "@/lib/format/formatDayLabel";
import { PutBackButton } from "./PutBackButton";
import { ManagerCancelButton } from "./ManagerCancelButton";
import { MarkSeenOnMount } from "../MarkSeenOnMount";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

const STATUS_LABEL: Record<SwapRequestView["status"], string> = {
  open: "Open — nobody has taken it",
  completed: "Swapped",
  cancelled: "Cancelled",
  put_back: "Put back",
  unclaimed: "Expired — nobody took it",
  // Deliberately does not guess who worked: the finalized roster is the
  // record for a past shift, not a planning row.
  unresolved: "Expired — check the roster for who worked",
  // Legacy, from before the approval gate was deleted on 2026-09-03.
  pending_manager_approval: "Waiting on a decision (old)",
  declined: "Declined (old)",
};

/** Tone per status, replacing the raw bg-green-100/text-green-800 pairs
 * this page used before the 2026-08-23 retrofit. `primary` for the one
 * state anyone can still act on — an open offer — so the row that wants
 * something from you is the row that stands out. Expired states are
 * neutral: they are history, and history should not shout. */
const STATUS_TONE: Record<SwapRequestView["status"], BadgeTone> = {
  open: "primary",
  completed: "success",
  cancelled: "neutral",
  put_back: "warning",
  unclaimed: "neutral",
  unresolved: "warning",
  pending_manager_approval: "neutral",
  declined: "neutral",
};

/** An open offer this close to its shift is the one thing on this page
 * that needs a human: nobody has taken it and there may be no time left
 * to find someone. Two days, so a manager who looks once a day still sees
 * it with a day in hand. */
const UNCLAIMED_SOON_DAYS = 2;

/** Manager-facing shift-swap inbox (Schedule Planner Phase E, 2026-08-16)
 * -- mirrors /schedule/leave's shape: a log, and almost none of it needs
 * an action.
 *
 * The approval gate was DELETED on 2026-09-03. Taking a shift completes
 * the swap immediately at any notice, so nothing on this page waits on a
 * manager's click. Two things can still want attention, and both are
 * lifted to the top rather than left in the list: an open offer whose
 * shift is nearly here and still unclaimed (nobody may be coming), and a
 * completed swap the manager wants to reverse ("put it back", available
 * until the shift starts).
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
  const today = businessTodayIso();
  const [requests, canDecide] = await Promise.all([
    loadSwapRequestsForManager(today),
    hasCapability("SCHEDULE_MANAGE"),
  ]);

  // An open offer whose shift is nearly here and still unclaimed is the
  // only thing on this page that can still go wrong, so it is lifted out
  // of the log and shown first with the time remaining. Everything else
  // is in the loader's order (open, then swapped, then history).
  const urgent = requests.filter(
    (r) => r.status === "open" && daysBetween(today, r.date) <= UNCLAIMED_SOON_DAYS
  );
  const urgentIds = new Set(urgent.map((r) => r.id));
  const rest = requests.filter((r) => !urgentIds.has(r.id));

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
              ? "Every swap staff have posted or taken. A shift changes hands as soon as a coworker takes it — you're told, you don't have to approve it. If a swap isn't right, put the shift back any time before it starts."
              : "Every swap staff have posted or taken. A shift changes hands as soon as a coworker takes it."
          }
        />
      </div>

      {requests.length === 0 ? (
        <EmptyState message="No upcoming swap activity." />
      ) : (
        <div className="space-y-4">
          {urgent.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--ink-900)] mb-2">
                Still nobody — shift is nearly here
              </h2>
              <div className="space-y-2">
                {urgent.map((r) => (
                  <SwapRow key={r.id} request={r} canDecide={canDecide} today={today} urgent />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              {/* Headed even when it is the only group (2026-09-03 visual
                  audit): without it, the urgent heading above appeared to
                  label every card on the page, and a swap three days out
                  read as "nearly here". */}
              <h2 className="text-sm font-semibold text-[var(--ink-900)] mb-2">
                {urgent.length > 0 ? "Everything else" : "Swap activity"}
              </h2>
              <div className="space-y-2">
                {rest.map((r) => (
                  <SwapRow key={r.id} request={r} canDecide={canDecide} today={today} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function SwapRow({
  request: r,
  canDecide,
  today,
  urgent = false,
}: {
  request: SwapRequestView;
  canDecide: boolean;
  today: string;
  urgent?: boolean;
}) {
  const shiftLabel = `${r.positionName} · ${formatDayLabel(r.date)} · ${r.period}`;
  // Acting is SCHEDULE_MANAGE-only (2026-08-24) — other managers see the
  // inbox but not the buttons; the server actions check again anyway.
  const daysLeft = daysBetween(today, r.date);
  // Put-back is only meaningful while the shift is still ahead: afterwards
  // it has happened, and the roster is the record of who worked it.
  const canPutBack = canDecide && r.status === "completed" && daysLeft >= 0;

  return (
    <div
      className={
        "rounded-[var(--radius-lg)] border p-3 sm:p-4 bg-[var(--card)] " +
        (urgent ? "border-[var(--primary-border)]" : "border-[var(--border)]")
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          {/* "Erika → Meji" (Oliver, 2026-08-25): the direction of the hand-off
              is the headline, not a sub-line. Declined/cancelled keep the plain
              name — no transfer happened, an arrow would claim one did. */}
          <div className="font-medium text-[var(--ink-900)]">
            {r.chain.length > 0 ? (
              /* Re-offered at least once (2026-09-03): show the whole
                 hand-off, "Meji → Erika → open", so the manager can see
                 where the shift came from rather than a bare current
                 holder. Derived from the completed swaps on this same
                 assignment — no new state. */
              <>
                {r.chain.map((name, i) => (
                  <span key={`${name}-${i}`}>
                    {i > 0 && (
                      <>
                        <span className="text-[var(--ink-400)]" aria-hidden>
                          {" "}
                          &rarr;{" "}
                        </span>
                        <span className="sr-only"> to </span>
                      </>
                    )}
                    {name}
                  </span>
                ))}
                {r.status === "open" && (
                  <>
                    <span className="text-[var(--ink-400)]" aria-hidden>
                      {" "}
                      &rarr;{" "}
                    </span>
                    <span className="sr-only"> to </span>
                    <span className="text-[var(--ink-500)] font-normal">open</span>
                  </>
                )}
              </>
            ) : r.acceptingEmployeeName && r.status === "completed" ? (
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

          {r.acceptingEmployeeName && (r.status === "declined" || r.status === "put_back" || r.status === "unresolved") && (
            <div className="text-xs text-[var(--ink-500)] mt-1">Was taken by {r.acceptingEmployeeName}</div>
          )}
          {/* The reason a manager typed when cancelling or putting a shift
              back — both staff members see this same text on their own My
              Schedule, so it is shown here verbatim too. */}
          {r.cancelReason && (r.status === "cancelled" || r.status === "put_back") && (
            <div className="text-xs text-[var(--ink-700)] mt-1">
              {r.cancelledByName ? `${r.cancelledByName}: ` : ""}
              &ldquo;{r.cancelReason}&rdquo;
            </div>
          )}
          {r.note && <div className="text-xs text-[var(--ink-500)] mt-1 italic">&ldquo;{r.note}&rdquo;</div>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            {urgent && (
              <span className="text-xs font-semibold text-[var(--ink-900)]">
                {daysLeft <= 0 ? "Shift is today" : daysLeft === 1 ? "Shift is tomorrow" : `${daysLeft} days left`}
              </span>
            )}
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

        {(canPutBack || (r.status === "open" && canDecide)) && (
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            {canPutBack && (
              <PutBackButton
                requestId={r.id}
                requestingEmployeeName={r.requestingEmployeeName}
                acceptingEmployeeName={r.acceptingEmployeeName}
              />
            )}
            {/* Manager cancel (2026-08-30): an open request previously had
                no manager-side resolution at all, which dead-ended the
                danger-zone delete gate. */}
            {r.status === "open" && (
              <ManagerCancelButton requestId={r.id} requestingEmployeeName={r.requestingEmployeeName} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
