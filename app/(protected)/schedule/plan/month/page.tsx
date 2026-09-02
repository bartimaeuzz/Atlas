import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadMonthOverview } from "@/lib/schedule/loadMonthOverview";
import { shiftMonth, weekStartFor } from "@/lib/schedule/weekMath";
import { PageHeader } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Zoom out" view (2026-08-11, Oliver): a calendar covering the whole
 * month so he can see what's coming at a glance, then click into any
 * day to jump to that week's real grid. Deliberately NOT limited to
 * weeks someone has already clicked "Generate" on — see
 * loadMonthOverview's comment for why projecting forward from the
 * recurring template is the right default here. */
export default async function MonthOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const monthAnchor = params.month || businessTodayIso();
  const data = await loadMonthOverview(monthAnchor);

  const prevMonth = shiftMonth(monthAnchor, -1);
  const nextMonth = shiftMonth(monthAnchor, 1);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/schedule" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Schedule Planner
      </Link>

      <PageHeader
        title="Month Overview"
        description={`${data.monthLabel}. Weeks you haven't generated yet are projected from your recurring templates — click any day to jump into that week: a read-only Preview for weeks that already exist, or straight to Generate for ones that don't.`}
        actions={
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/schedule/plan/person?month=${monthAnchor}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
              View by person
            </Link>
            <Link href={`/schedule/plan?week=${weekStartFor(monthAnchor)}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
              Zoom in to weekly view &rarr;
            </Link>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link href={`/schedule/plan/month?month=${prevMonth}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          &larr; Previous month
        </Link>
        <Link href={`/schedule/plan/month?month=${nextMonth}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Next month &rarr;
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-500)] mb-3">
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
              <th key={label} className="text-left text-[var(--ink-500)] pb-2 font-normal text-xs">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day) => (
                <td key={day.date} className="align-top border border-[var(--border)] p-0">
                  <Link
                    href={
                      // A generated week (draft/published) has something
                      // real to look at, so clicking goes to the
                      // read-only Preview first (2026-08-16, Oliver) --
                      // same "edit must be a deliberate separate action"
                      // rule already used for the weekly grid's own
                      // Preview page. A still-"projected" day has nothing
                      // to preview yet (it's only ever been estimated
                      // from the template, never generated), so it keeps
                      // going straight to Weekly Plan, which shows the
                      // "Generate this week" button.
                      day.weekStatus === "projected"
                        ? `/schedule/plan?week=${weekStartFor(day.date)}`
                        : `/schedule/plan/preview?week=${weekStartFor(day.date)}&view=manager`
                    }
                    className={"block h-20 p-1.5 hover:bg-[var(--hover)]" + (day.inMonth ? "" : " opacity-40")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--ink-700)]">{Number(day.date.slice(8))}</span>
                      {/* title= kept as a desktop hover hint only; the legend above and the
                          "N short"/"Covered" text below are the primary, mobile-visible signal
                          — this dot alone is not the sole conveyor of status (2026-08-18).
                          NOTE: still on the backlog list for the repo-wide title= tooltip
                          migration (see project_atlas_ui_design.md, backlog item 2). */}
                      <span
                        title={
                          day.weekStatus === "published"
                            ? "Published"
                            : day.weekStatus === "draft"
                              ? "Draft"
                              : "Projected — not generated yet"
                        }
                        className={
                          "w-1.5 h-1.5 rounded-full shrink-0 " +
                          (day.weekStatus === "published"
                            ? "bg-[var(--success)]"
                            : day.weekStatus === "draft"
                              ? "bg-[var(--border-strong)]"
                              : "bg-[var(--primary)]")
                        }
                      />
                    </div>
                    {day.targetCells > 0 && (
                      <div
                        className={"text-xs mt-1 " + (day.shortfallCells > 0 ? "text-[var(--danger-700)] font-medium" : "text-[var(--success-700)]")}
                      >
                        {day.shortfallCells > 0 ? `${day.shortfallCells} short` : "Covered"}
                      </div>
                    )}
                  </Link>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
