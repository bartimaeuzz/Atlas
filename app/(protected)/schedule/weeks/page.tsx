import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadWeeksList } from "@/lib/schedule/loadWeeksList";
import { shiftWeek, weekStartFor } from "@/lib/schedule/weekMath";

const WINDOW_SIZE = 12;

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  not_planned: "Not planned",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-[var(--paper)] text-[var(--ink-700)]",
  not_planned: "bg-[var(--paper)] text-[var(--ink-400)] border border-dashed border-[var(--border-strong)]",
};

/** Simple week-by-week navigation list (2026-08-11, Oliver) — a flat
 * "what's published, what's still draft, what hasn't been touched"
 * view, faster to scan than clicking through the weekly grid one week
 * at a time or reading the day-level month calendar. Complements
 * /schedule/plan/month rather than replacing it. */
export default async function WeeksListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const windowStart = params.from || shiftWeek(weekStartFor(businessTodayIso()), -2);
  const data = await loadWeeksList(windowStart, WINDOW_SIZE);

  const thisWeek = weekStartFor(businessTodayIso());
  const prevWindow = shiftWeek(windowStart, -WINDOW_SIZE);
  const nextWindow = shiftWeek(windowStart, WINDOW_SIZE);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Weeks</h1>
      <p className="text-[var(--ink-500)] text-sm mb-4">
        Every week at a glance — published, still draft, or not planned yet.
      </p>

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link href={`/schedule/weeks?from=${prevWindow}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr; Earlier
        </Link>
        <Link href={`/schedule/weeks?from=${nextWindow}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          Later &rarr;
        </Link>
      </div>

      <div className="divide-y border rounded">
        {data.weeks.map((w) => {
          const isThisWeek = w.weekStartDate === thisWeek;
          const isPlanned = w.status !== "not_planned";

          return (
            <div key={w.weekStartDate} className={"flex items-center justify-between px-4 py-3" + (isThisWeek ? " bg-[var(--paper)]" : "")}>
              <div>
                <div className="text-sm font-medium">
                  Week of {w.weekStartDate} – {w.weekEndDate}
                  {isThisWeek && <span className="ml-2 text-xs text-[var(--ink-400)]">This week</span>}
                </div>
                <span className={"inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium " + STATUS_BADGE_CLASS[w.status]}>
                  {STATUS_LABEL[w.status]}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm shrink-0">
                {isPlanned ? (
                  <>
                    <Link href={`/schedule/plan/preview?week=${w.weekStartDate}`} className="text-[var(--ink-700)] hover:text-[var(--ink-900)] underline">
                      Preview &rarr;
                    </Link>
                    <Link href={`/schedule/plan?week=${w.weekStartDate}`} className="text-[var(--ink-700)] hover:text-[var(--ink-900)] underline">
                      Edit &rarr;
                    </Link>
                  </>
                ) : (
                  <Link href={`/schedule/plan?week=${w.weekStartDate}`} className="text-[var(--ink-700)] hover:text-[var(--ink-900)] underline">
                    Plan this week &rarr;
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
