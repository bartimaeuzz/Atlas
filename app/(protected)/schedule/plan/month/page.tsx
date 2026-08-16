import Link from "next/link";
import { loadMonthOverview } from "@/lib/schedule/loadMonthOverview";
import { shiftMonth, toIso, weekStartFor } from "@/lib/schedule/weekMath";

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
  const monthAnchor = params.month || toIso(new Date());
  const data = await loadMonthOverview(monthAnchor);

  const prevMonth = shiftMonth(monthAnchor, -1);
  const nextMonth = shiftMonth(monthAnchor, 1);

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-semibold">Month Overview</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/schedule/plan/person?month=${monthAnchor}`} className="text-neutral-500 hover:text-black underline">
            View by person
          </Link>
          <Link href={`/schedule/plan?week=${weekStartFor(monthAnchor)}`} className="text-neutral-500 hover:text-black underline">
            Zoom in to weekly view &rarr;
          </Link>
        </div>
      </div>
      <p className="text-neutral-500 text-sm mb-4">
        {data.monthLabel}. Weeks you haven&apos;t generated yet are projected from your recurring
        templates — click any day to jump into that week: a read-only Preview for weeks that
        already exist, or straight to Generate for ones that don&apos;t.
      </p>

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link href={`/schedule/plan/month?month=${prevMonth}`} className="text-neutral-500 hover:text-black underline">
          &larr; Previous month
        </Link>
        <Link href={`/schedule/plan/month?month=${nextMonth}`} className="text-neutral-500 hover:text-black underline">
          Next month &rarr;
        </Link>
      </div>

      <div className="flex items-center gap-4 text-xs text-neutral-500 mb-3">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Published
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-neutral-400 inline-block" /> Draft
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Projected — not generated yet
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
              {week.map((day) => (
                <td key={day.date} className="align-top border p-0">
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
                    className={"block h-20 p-1.5 hover:bg-neutral-50" + (day.inMonth ? "" : " opacity-40")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-600">{Number(day.date.slice(8))}</span>
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
                            ? "bg-green-500"
                            : day.weekStatus === "draft"
                              ? "bg-neutral-400"
                              : "bg-blue-400")
                        }
                      />
                    </div>
                    {day.targetCells > 0 && (
                      <div
                        className={"text-[11px] mt-1 " + (day.shortfallCells > 0 ? "text-red-600 font-medium" : "text-green-600")}
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
