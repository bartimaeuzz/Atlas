import Link from "next/link";
import { loadWeeksList } from "@/lib/schedule/loadWeeksList";
import { shiftWeek, toIso, weekStartFor } from "@/lib/schedule/weekMath";

const WINDOW_SIZE = 12;

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  not_planned: "Not planned",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-neutral-100 text-neutral-600",
  not_planned: "bg-neutral-50 text-neutral-400 border border-dashed border-neutral-300",
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
  const windowStart = params.from || shiftWeek(weekStartFor(toIso(new Date())), -2);
  const data = await loadWeeksList(windowStart, WINDOW_SIZE);

  const thisWeek = weekStartFor(toIso(new Date()));
  const prevWindow = shiftWeek(windowStart, -WINDOW_SIZE);
  const nextWindow = shiftWeek(windowStart, WINDOW_SIZE);

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Weeks</h1>
      <p className="text-neutral-500 text-sm mb-4">
        Every week at a glance — published, still draft, or not planned yet.
      </p>

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link href={`/schedule/weeks?from=${prevWindow}`} className="text-neutral-500 hover:text-black underline">
          &larr; Earlier
        </Link>
        <Link href={`/schedule/weeks?from=${nextWindow}`} className="text-neutral-500 hover:text-black underline">
          Later &rarr;
        </Link>
      </div>

      <div className="divide-y border rounded">
        {data.weeks.map((w) => {
          const isThisWeek = w.weekStartDate === thisWeek;
          const href =
            w.status === "draft"
              ? `/schedule/plan/preview?week=${w.weekStartDate}`
              : `/schedule/plan?week=${w.weekStartDate}`;
          const actionLabel = w.status === "published" ? "View" : w.status === "draft" ? "Review & publish" : "Plan this week";

          return (
            <div key={w.weekStartDate} className={"flex items-center justify-between px-4 py-3" + (isThisWeek ? " bg-neutral-50" : "")}>
              <div>
                <div className="text-sm font-medium">
                  Week of {w.weekStartDate} – {w.weekEndDate}
                  {isThisWeek && <span className="ml-2 text-xs text-neutral-400">This week</span>}
                </div>
                <span className={"inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium " + STATUS_BADGE_CLASS[w.status]}>
                  {STATUS_LABEL[w.status]}
                </span>
              </div>
              <Link href={href} className="text-sm text-neutral-600 hover:text-black underline shrink-0">
                {actionLabel} &rarr;
              </Link>
            </div>
          );
        })}
      </div>
    </main>
  );
}
