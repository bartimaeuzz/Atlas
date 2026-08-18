import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadEmployeeSchedule } from "@/lib/schedule/loadEmployeeSchedule";
import { loadRecentScheduleChanges } from "@/lib/schedule/loadRecentScheduleChanges";
import { loadMyLeaveRequests } from "@/lib/schedule/loadLeaveRequests";
import {
  loadMySwappableAssignments,
  loadAcceptableSwapRequests,
  loadMySwapRequests,
} from "@/lib/schedule/loadSwapRequests";
import { shiftMonth, toIso } from "@/lib/schedule/weekMath";
import { LeaveRequestsPanel } from "./LeaveRequestsPanel";
import { SwapBoardPanel } from "./SwapBoardPanel";
import { PageHeader, EmptyState } from "@/components/ui/Card";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Staff-facing "My Schedule" (2026-08-14, Oliver) — reuses
 * loadEmployeeSchedule, whose own doc comment called this out ahead of
 * time ("same loader, just pre-selected to the logged-in employee
 * instead of a manager's pick"). Deliberately a separate route from the
 * manager /schedule/plan/person page rather than sharing it: this one is
 * locked to the logged-in employee's own id (no employeeId param, no
 * picker), and only renders PUBLISHED weeks — Oliver's words: staff
 * should see "only published schedule", not a manager's still-editable
 * draft.
 *
 * Two distinct "nothing here" states (2026-08-14, same day, Oliver's
 * follow-up) that were previously both just a blank cell -- now made
 * visually distinct so staff don't confuse "not published yet" with
 * "you're off":
 *   - Published week, no shift that day -> a "Day off" tile.
 *   - Week not published yet (draft/projected) -> the whole cell is
 *     shaded grey, no tile at all, meaning "not available yet."
 */
export default async function MyScheduleView({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const monthAnchor = params.month || toIso(new Date());
  const today = toIso(new Date());
  const [data, recentChangesAll, leaveRequests, swappable, acceptableSwaps, mySwaps] = await Promise.all([
    loadEmployeeSchedule(session.id, monthAnchor),
    // Defaults to published-only -- see loadRecentScheduleChanges's own
    // comment for why that filter lives in the loader itself now.
    loadRecentScheduleChanges(session.id),
    loadMyLeaveRequests(session.id),
    loadMySwappableAssignments(session.id, today),
    loadAcceptableSwapRequests(session.id, today),
    loadMySwapRequests(session.id),
  ]);
  const recentChanges = recentChangesAll.slice(0, 10);

  const prevMonth = shiftMonth(monthAnchor, -1);
  const nextMonth = shiftMonth(monthAnchor, 1);

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <PageHeader
        title="My Schedule"
        description={`${data.employeeName} — ${data.monthLabel}. Grey days mean that week hasn't been published yet — not that you're off.`}
      />

      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        <Link href="/me" className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          My Pay
        </Link>
        <span className="text-[var(--border-strong)]">|</span>
        <Link href={`/me/schedule?month=${prevMonth}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr; Previous month
        </Link>
        <Link href={`/me/schedule?month=${nextMonth}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          Next month &rarr;
        </Link>
        <span className="text-[var(--border-strong)]">|</span>
        {/* Full-week view (2026-08-16, Oliver): a Position x Day grid
            like the manager sees, read-only, so staff can spot ring-
            color swap/leave status across the whole week at once
            instead of clicking one day at a time. Always lands on the
            week containing today; the page itself has its own
            prev/next week nav from there. */}
        <Link href="/me/schedule/week" className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          View full week &rarr;
        </Link>
      </div>

      <LeaveRequestsPanel requests={leaveRequests} />

      <SwapBoardPanel swappable={swappable} acceptable={acceptableSwaps} mine={mySwaps} />

      <div className="mb-6">
        <h2 className="text-sm font-medium mb-2 text-[var(--ink-900)]">Recent changes to your schedule</h2>
        {recentChanges.length > 0 ? (
          <>
            <p className="text-xs text-[var(--ink-500)] mb-3">
              A manager removed these shifts after the schedule was already published.
            </p>
            <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm">
              {recentChanges.map((c) => (
                <div key={`${c.id}-${c.date}-${c.positionName}-${c.period}`} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>
                      {c.action === "DELETED_WEEK" ? "Whole week removed" : "Shift removed"} —{" "}
                      {c.date ?? `week of ${c.weekStartDate}`}: {c.positionName} ({c.period === "Lunch" ? "L" : "D"})
                    </span>
                    <span className="text-xs text-[var(--ink-400)]">{c.createdAt.slice(0, 10)}</span>
                  </div>
                  <p className="text-xs text-[var(--ink-500)] mt-0.5">
                    By {c.performedByName}
                    {c.reason ? ` — "${c.reason}"` : ""}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState message="No changes to schedule" />
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--ink-500)] mb-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[var(--paper)] border border-[var(--border-strong)] inline-block" /> Day off
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[var(--border-strong)] inline-block" /> Not published yet
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {DAY_LABELS.map((label) => (
              <th key={label} className="text-left text-[var(--ink-500)] pb-2 font-normal text-xs">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day) => {
                const isPublished = day.weekStatus === "published";
                const shifts = isPublished ? day.shifts : [];
                const dayNumber = Number(day.date.slice(8));

                const cellInner = (
                  <>
                    <span className={"text-xs " + (isPublished ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]")}>
                      {dayNumber}
                    </span>
                    {isPublished && (
                      <div className="space-y-0.5 mt-1">
                        {shifts.length > 0 ? (
                          shifts.map((s, si) => (
                            <div
                              key={si}
                              className={
                                "text-[10px] rounded-[var(--radius-sm)] px-1 py-0.5 " +
                                (s.isExtraCoverage
                                  ? "bg-[var(--warning-tint)] text-[var(--warning-700)]"
                                  : "bg-[var(--paper)] text-[var(--ink-700)]")
                              }
                            >
                              {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] rounded-[var(--radius-sm)] px-1 py-0.5 border border-[var(--border)] text-[var(--ink-400)] text-center">
                            Day off
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );

                return (
                  <td
                    key={day.date}
                    className={"align-top border border-[var(--border)] p-1.5" + (isPublished ? "" : " bg-[var(--paper)]")}
                  >
                    {isPublished ? (
                      // Published days are clickable -- see who's working
                      // that day (2026-08-14, Oliver's ask). Not-yet-
                      // published (grey) days aren't, since there's
                      // nothing staff are allowed to see there yet.
                      <Link
                        href={`/me/schedule/day?date=${day.date}`}
                        className={"block min-h-24 rounded-[var(--radius-sm)] hover:bg-[var(--paper)]" + (day.inMonth ? "" : " opacity-40")}
                      >
                        {cellInner}
                      </Link>
                    ) : (
                      <div className={"min-h-24" + (day.inMonth ? "" : " opacity-40")}>{cellInner}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

    </main>
  );
}
