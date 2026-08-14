import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadEmployeeSchedule } from "@/lib/schedule/loadEmployeeSchedule";
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
 * draft. Draft/projected days render blank rather than leaking the
 * in-progress plan.
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
  const data = await loadEmployeeSchedule(session.id, monthAnchor);

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
        {data.employeeName} — {data.monthLabel}. Only shows weeks that have been published; a blank
        day just means that week hasn't been published yet, not that you're off.
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
                const publishedShifts = day.weekStatus === "published" ? day.shifts : [];
                return (
                  <td key={day.date} className="align-top border p-1.5">
                    <div className={"min-h-24" + (day.inMonth ? "" : " opacity-40")}>
                      <span className="text-xs text-neutral-600">{Number(day.date.slice(8))}</span>
                      <div className="space-y-0.5 mt-1">
                        {publishedShifts.map((s, si) => (
                          <div
                            key={si}
                            className={
                              "text-[10px] rounded px-1 py-0.5 " +
                              (s.isExtraCoverage ? "bg-yellow-100 text-yellow-900" : "bg-neutral-100 text-neutral-700")
                            }
                          >
                            {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
                          </div>
                        ))}
                      </div>
                    </div>
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
