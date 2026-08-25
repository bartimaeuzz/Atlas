import Link from "next/link";
import { loadEmployeeSchedule } from "@/lib/schedule/loadEmployeeSchedule";
import { loadEmployeesList } from "@/lib/employees/loadEmployeesList";
import { shiftMonth, toIso, weekStartFor } from "@/lib/schedule/weekMath";
import { PageHeader, Card } from "@/components/ui/Card";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Zoom in on one person" (2026-08-11, Oliver) — pick an employee, see
 * their shifts across a month. No employeeId in the URL yet? Show the
 * picker. Built to double as the future staff-facing "My Schedule"
 * page's core view later — same loader, just pre-selected to the
 * logged-in employee instead of a manager's pick. */
export default async function EmployeeSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; month?: string }>;
}) {
  const params = await searchParams;
  const monthAnchor = params.month || toIso(new Date());

  if (!params.employeeId) {
    const employeeList = await loadEmployeesList();
    const activeEmployees = employeeList.filter((e) => e.active);

    return (
      <main className="max-w-3xl mx-auto p-4 sm:p-8 font-sans">
        <Link href="/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          &larr; Schedule Planner
        </Link>
        <PageHeader title="Person Schedule" description="Pick someone to see their shifts for the month." />

        {activeEmployees.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">No active employees yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {activeEmployees.map((e) => (
              <Link key={e.id} href={`/schedule/plan/person?employeeId=${e.id}&month=${monthAnchor}`}>
                <Card className="hover:bg-[var(--paper)] transition-colors text-sm !p-3">{e.nickname}</Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    );
  }

  const employeeId = Number(params.employeeId);
  const data = await loadEmployeeSchedule(employeeId, monthAnchor);

  const prevMonth = shiftMonth(monthAnchor, -1);
  const nextMonth = shiftMonth(monthAnchor, 1);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/schedule/plan/person" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Change person
      </Link>
      <PageHeader title={data.employeeName} description={data.monthLabel} />

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link
          href={`/schedule/plan/person?employeeId=${employeeId}&month=${prevMonth}`}
          className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline"
        >
          &larr; Previous month
        </Link>
        <Link
          href={`/schedule/plan/person?employeeId=${employeeId}&month=${nextMonth}`}
          className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline"
        >
          Next month &rarr;
        </Link>
      </div>

      {/* Month totals (Oliver, 2026-08-25). Numbers come from
          loadEmployeeSchedule's stats block, not computed here, so other
          surfaces can reuse the same definitions. */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <StatTile label="Planned shifts" value={data.stats.planned} />
        <StatTile label="Published shifts" value={data.stats.published} />
        <StatTile label="Swapped in" value={data.stats.swappedIn} />
        <StatTile label="Extra coverage" value={data.stats.coverage} />
        <StatTile label="Leave days" value={data.stats.leaveDays} />
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--ink-500)] mb-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--success)] inline-block" /> Published
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--border-strong)] inline-block" /> Draft
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--primary)] inline-block" /> Projected — not generated yet
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {DAY_LABELS.map((label) => (
              <th key={label} className="text-left text-[var(--ink-700)] pb-2 font-medium text-xs">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day) => {
                const isToday = day.date === toIso(new Date());
                return (
                <td key={day.date} className="align-top border border-[var(--border)] p-0">
                  <Link
                    href={`/schedule/plan?week=${weekStartFor(day.date)}`}
                    className={
                      "block min-h-24 p-1.5 hover:bg-[var(--paper)]" +
                      (day.inMonth ? "" : " opacity-40") +
                      // Today wash + filled day number: same convention as My
                      // Schedule's calendar (e7cf846) and the plan grid's day
                      // tabs — "today must be findable" (Oliver, 2026-08-25).
                      (isToday ? " bg-[var(--primary-tint)]" : "")
                    }
                  >
                    <div className="flex items-center justify-between">
                      {isToday ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--primary)] text-white text-sm font-medium">
                          {Number(day.date.slice(8))}
                          <span className="sr-only"> today</span>
                        </span>
                      ) : (
                        <span className={"text-sm " + (day.inMonth ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-500)]")}>
                          {Number(day.date.slice(8))}
                        </span>
                      )}
                      {day.shifts.length > 0 && (
                        // title= kept as a desktop hover hint only; see note in month/page.tsx
                        // -- still on the repo-wide title= tooltip migration backlog.
                        <span
                          title={
                            day.weekStatus === "published"
                              ? "Published"
                              : day.weekStatus === "draft"
                                ? "Draft"
                                : "Projected — not generated yet"
                          }
                          className={
                            "w-2 h-2 rounded-full shrink-0 " +
                            (day.weekStatus === "published"
                              ? "bg-[var(--success)]"
                              : day.weekStatus === "draft"
                                ? "bg-[var(--border-strong)]"
                                : "bg-[var(--primary)]")
                          }
                        />
                      )}
                    </div>
                    <div className="space-y-0.5 mt-1">
                      {day.shifts.map((s, si) => (
                        // 12px medium bordered chips, not 10px grey-on-grey
                        // (e7cf846's exact fix on My Schedule). Published days
                        // get the primary-tint fill; draft/projected stay on
                        // --paper so the fill echoes the status dot + legend.
                        <div
                          key={si}
                          className={
                            "text-xs font-medium rounded border px-1 py-0.5 " +
                            (s.isExtraCoverage
                              ? "bg-[var(--warning-tint)] text-[var(--warning-700)] border-[var(--warning-border)]"
                              : day.weekStatus === "published"
                                ? "bg-[var(--primary-tint)] text-[var(--primary-700)] border-[var(--primary-border)]"
                                : "bg-[var(--paper)] text-[var(--ink-700)] border-[var(--border-strong)]")
                          }
                        >
                          {s.positionName} ({s.period === "Lunch" ? "L" : "D"})
                        </div>
                      ))}
                      {/* Day-of records (2026-08-25): what actually
                          happened -- attendance + coverage from shift
                          data. Manager surface, so all of them show. */}
                      {day.dayRecords.map((r, ri) => (
                        <div
                          key={`r-${ri}`}
                          className={
                            "text-[10px] font-medium rounded border px-1 py-0.5 " +
                            (r.kind === "no_show"
                              ? "bg-[var(--danger-tint)] text-[var(--danger-700)] border-[var(--danger-border)]"
                              : r.kind === "late" || r.kind === "extra"
                                ? "bg-[var(--warning-tint)] text-[var(--warning-700)] border-[var(--warning-border)]"
                                : r.kind === "emergency"
                                ? "bg-[var(--paper)] text-[var(--ink-700)] border-[var(--border-strong)]"
                                : "bg-teal-100 text-teal-700 border-teal-300")
                          }
                        >
                          {r.kind === "no_show" ? "No show" : r.kind === "late" ? "Late" : r.kind === "emergency" ? "Emergency" : r.kind === "extra" ? "Extra" : "Sub"}
                          {r.positionName ? ` — ${r.positionName}` : ""} ({r.period === "Lunch" ? "L" : "D"})
                        </div>
                      ))}
                    </div>
                  </Link>
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="!p-3">
      <div className="text-xl font-semibold tabular-nums text-[var(--ink-900)]">{value}</div>
      <div className="text-xs text-[var(--ink-500)] mt-0.5">{label}</div>
    </Card>
  );
}

