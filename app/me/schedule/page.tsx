import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadEmployeeSchedule } from "@/lib/schedule/loadEmployeeSchedule";
import { loadRecentScheduleChanges } from "@/lib/schedule/loadRecentScheduleChanges";
import { shiftMonth, toIso } from "@/lib/schedule/weekMath";
import { logout } from "@/lib/actions/auth";

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
  const [data, recentChangesAll] = await Promise.all([
    loadEmployeeSchedule(session.id, monthAnchor),
    // Defaults to published-only -- see loadRecentScheduleChanges's own
    // comment for why that filter lives in the loader itself now.
    loadRecentScheduleChanges(session.id),
  ]);
  const recentChanges = recentChangesAll.slice(0, 10);

  const prevMonth = shiftMonth(monthAnchor, -1);
  const nextMonth = shiftMonth(monthAnchor, 1);

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">My Schedule</h1>
        <form action={logout}>
          <button type="submit" className="text-sm text-neutral-500 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {data.employeeName} — {data.monthLabel}. Grey days mean that week hasn't been published yet
        — not that you're off.
      </p>

      <div className="flex items-center gap-4 mb-4 text-sm">
        <Link href="/me" className="text-neutral-500 hover:text-black underline">
          My Pay
        </Link>
        <span className="text-neutral-300">|</span>
        <Link href={`/me/schedule?month=${prevMonth}`} className="text-neutral-500 hover:text-black underline">
          &larr; Previous month
        </Link>
        <Link href={`/me/schedule?month=${nextMonth}`} className="text-neutral-500 hover:text-black underline">
          Next month &rarr;
        </Link>
      </div>

      <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-neutral-100 border border-neutral-300 inline-block" /> Day off
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-neutral-300 inline-block" /> Not published yet
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {DAY_LABELS.map((label) => (
              <th key={label} className="text-left text-neutral-500 pb-2 font-normal text-xs">
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

                return (
                  <td
                    key={day.date}
                    className={"align-top border p-1.5" + (isPublished ? "" : " bg-neutral-100")}
                  >
                    <div className={"min-h-24" + (day.inMonth ? "" : " opacity-40")}>
                      <span className={"text-xs " + (isPublished ? "text-neutral-600" : "text-neutral-400")}>
                        {dayNumber}
                      </span>
                      {isPublished && (
                        <div className="space-y-0.5 mt-1">
                          {shifts.length > 0 ? (
                            shifts.map((s, si) => (
                              <div
                                key={si}
                                className={
                                  "text-[10px] rounded px-1 py-0.5 " +
                                  (s.isExtraCoverage
                                    ? "bg-yellow-100 text-yellow-900"
                                    : "bg-neutral-100 text-neutral-700")
                                }
                              >
                                {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
                              </div>
                            ))
                          ) : (
                            <div className="text-[10px] rounded px-1 py-0.5 border border-neutral-200 text-neutral-400 text-center">
                              Day off
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {recentChanges.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium mb-2">Recent changes to your schedule</h2>
          <p className="text-xs text-neutral-500 mb-3">
            A manager removed these shifts after the schedule was already published.
          </p>
          <div className="divide-y border rounded text-sm">
            {recentChanges.map((c) => (
              <div key={`${c.id}-${c.date}-${c.positionName}-${c.period}`} className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>
                    {c.action === "DELETED_WEEK" ? "Whole week removed" : "Shift removed"} —{" "}
                    {c.date ?? `week of ${c.weekStartDate}`}: {c.positionName} ({c.period === "Lunch" ? "L" : "D"})
                  </span>
                  <span className="text-xs text-neutral-400">{c.createdAt.slice(0, 10)}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  By {c.performedByName}
                  {c.reason ? ` — "${c.reason}"` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
