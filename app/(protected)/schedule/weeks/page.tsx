import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadWeeksList } from "@/lib/schedule/loadWeeksList";
import { shiftWeek, weekStartFor } from "@/lib/schedule/weekMath";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { PageHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const WINDOW_SIZE = 12;

/** Status rendering follows the locked 2026-08-25 conventions: statuses
 * are words, dashed = not-yet-real. Published/Draft reuse the same Badge
 * tones the shift pages use for the same words; "Not planned" keeps its
 * dashed border because the week doesn't exist yet. */
function WeekStatusBadge({ status }: { status: "published" | "draft" | "not_planned" }) {
  if (status === "published") return <Badge tone="success">Published</Badge>;
  if (status === "draft") return <Badge tone="warning">Draft</Badge>;
  return (
    <span className="inline-flex items-center whitespace-nowrap text-xs font-medium border border-dashed border-[var(--border-strong)] text-[var(--ink-500)] rounded-[var(--radius-full)] px-2.5 py-1 bg-[var(--paper)]">
      Not planned
    </span>
  );
}

/** Simple week-by-week navigation list (2026-08-11, Oliver) — a flat
 * "what's published, what's still draft, what hasn't been touched"
 * view. Since 2026-08-27 it is also the LANDING page for planning:
 * bare /schedule/plan redirects here, and each row is the way into
 * that week's plan (Oliver: "/schedule/plan land on /schedule/weeks
 * first"). Retrofitted the same day to the 2026-08-25 design
 * conventions: card shell, word badges, findable "this week". */
export default async function WeeksListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const windowStart = params.from || shiftWeek(weekStartFor(businessTodayIso()), -2);
  const [data, canManage] = await Promise.all([
    loadWeeksList(windowStart, WINDOW_SIZE),
    hasCapability("SCHEDULE_MANAGE"),
  ]);

  const thisWeek = weekStartFor(businessTodayIso());
  const prevWindow = shiftWeek(windowStart, -WINDOW_SIZE);
  const nextWindow = shiftWeek(windowStart, WINDOW_SIZE);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8">
      <p className="mb-2">
        <Link href="/schedule" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          &larr; Schedule Planner
        </Link>
      </p>
      <PageHeader
        title="Weeks"
        description="Every week at a glance — published, still draft, or not planned yet. Open a week to build or adjust its schedule."
      />

      <div className="flex items-center gap-4 mb-4 text-sm">
        <Link href={`/schedule/weeks?from=${prevWindow}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          &larr; Earlier
        </Link>
        <Link href={`/schedule/weeks?from=${nextWindow}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Later &rarr;
        </Link>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-1)] overflow-hidden divide-y divide-[var(--border)]">
        {data.weeks.map((w) => {
          const isThisWeek = w.weekStartDate === thisWeek;
          const isPlanned = w.status !== "not_planned";

          return (
            <div
              key={w.weekStartDate}
              className={
                "flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3" +
                (isThisWeek ? " bg-[var(--primary-tint)]" : "")
              }
            >
              <div className="min-w-0">
                <div className={"text-sm " + (isThisWeek ? "font-semibold text-[var(--primary-700)]" : "font-medium text-[var(--ink-900)]")}>
                  {w.weekStartDate} – {w.weekEndDate}
                  {isThisWeek && <span className="ml-1.5">· this week</span>}
                </div>
                <div className="mt-1">
                  <WeekStatusBadge status={w.status} />
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm shrink-0">
                {isPlanned ? (
                  <>
                    <Link
                      href={`/schedule/plan/preview?week=${w.weekStartDate}`}
                      className={`text-[var(--ink-700)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
                    >
                      Preview &rarr;
                    </Link>
                    <Link
                      href={`/schedule/plan?week=${w.weekStartDate}`}
                      className={`font-medium text-[var(--primary-700)] hover:text-[var(--primary)] underline ${TAP_TARGET_PAD}`}
                    >
                      {canManage ? <>Edit &rarr;</> : <>View &rarr;</>}
                    </Link>
                  </>
                ) : canManage ? (
                  <Link
                    href={`/schedule/plan?week=${w.weekStartDate}`}
                    className={`font-medium text-[var(--primary-700)] hover:text-[var(--primary)] underline ${TAP_TARGET_PAD}`}
                  >
                    Plan this week &rarr;
                  </Link>
                ) : (
                  <span className="text-[var(--ink-400)]">Nothing planned</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
