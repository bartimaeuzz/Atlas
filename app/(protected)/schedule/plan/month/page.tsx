import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadMonthOverview } from "@/lib/schedule/loadMonthOverview";
import { shiftMonth, weekStartFor } from "@/lib/schedule/weekMath";
import { PageHeader } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type WeekStatus = "published" | "draft" | "projected";

/** Same word-badge idiom as WeeklyPlanGrid's leave/reassigned/leaving
 * badges (2de3711, b1a69fd): a word survives where a dot is invisible, and
 * a 6px dot was the only thing telling Published / Draft / Projected apart
 * (WCAG 1.4.1, 2026-09-04 audit). Tokens follow the legend it replaces —
 * olive published, neutral draft, indigo projected — so nothing recolours.
 * A phone day cell is ~44px wide (48px collapsed rail + 16px page padding
 * each side, seven columns), so below lg: the word is abbreviated and the
 * badge padding shrinks to 2px so "Draft" (the longest) still fits; the
 * legend spells the full word next to the same badge. */
const STATUS_BADGE: Record<WeekStatus, { full: string; short: string; classes: string }> = {
  published: {
    full: "Published",
    short: "Pub.",
    classes: "bg-[var(--success-tint)] text-[var(--success-700)] border-[var(--success-border)]",
  },
  draft: {
    full: "Draft",
    short: "Draft",
    classes: "bg-[var(--paper)] text-[var(--ink-700)] border-[var(--border-strong)]",
  },
  projected: {
    full: "Projected",
    short: "Proj.",
    classes: "bg-[var(--primary-tint)] text-[var(--primary-700)] border-[var(--primary-border)]",
  },
};

function WeekStatusBadge({ status, full = false }: { status: WeekStatus; full?: boolean }) {
  const b = STATUS_BADGE[status];
  return (
    <span
      className={`inline-block text-xs font-semibold leading-tight px-0.5 lg:px-1.5 py-px rounded-[var(--radius-sm)] border whitespace-nowrap ${b.classes}`}
    >
      {full ? (
        b.full
      ) : (
        <>
          {/* Phone cells are ~36px wide, so the eye gets the short form and
              the screen reader gets the full word (WCAG 1.4.1 gain must
              survive for non-visual users too -- scrutinize 2026-09-04). */}
          <span aria-hidden="true" className="lg:hidden">{b.short}</span>
          <span className="sr-only lg:hidden">{b.full}</span>
          <span className="hidden lg:inline">{b.full}</span>
        </>
      )}
    </span>
  );
}

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
            <Link href={`/schedule/plan/person?month=${monthAnchor}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
              View by person
            </Link>
            <Link href={`/schedule/plan?week=${weekStartFor(monthAnchor)}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
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

      {/* Legend keeps the full word beside each badge so the phone
          abbreviation in the cells has a key. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-500)] mb-3">
        <span className="flex items-center gap-1.5">
          <WeekStatusBadge status="published" /> Published
        </span>
        <span className="flex items-center gap-1.5">
          <WeekStatusBadge status="draft" /> Draft
        </span>
        <span className="flex items-center gap-1.5">
          <WeekStatusBadge status="projected" /> Projected — not generated yet
        </span>
      </div>

      <table className="w-full table-fixed border-collapse text-sm">
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
                    className={"block h-20 p-1 lg:p-1.5 hover:bg-[var(--hover)]" + (day.inMonth ? "" : " opacity-40")}
                  >
                    <span className="block text-xs text-[var(--ink-700)]">{Number(day.date.slice(8))}</span>
                    {/* Word badge, not the old 6px dot (2026-09-04 audit, WCAG
                        1.4.1): the day's week status was told by colour alone. */}
                    <div className="mt-0.5">
                      <WeekStatusBadge status={day.weekStatus} />
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
