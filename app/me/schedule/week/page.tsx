import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadStaffWeeklyPlan } from "@/lib/schedule/loadStaffWeeklyPlan";
import { weekStartFor, shiftWeek } from "@/lib/schedule/weekMath";
import { WeeklyPlanGrid } from "@/app/schedule/WeeklyPlanGrid";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";

/**
 * Staff-facing full-week schedule view (2026-08-16, Oliver's ask: "staff
 * should see all day in a week schedule view as well like manager
 * diagnose view. but no edit and no understaff sign and other but can
 * see ring color status so they know someone swap in to their week and
 * such."). Reuses the exact same WeeklyPlanGrid component the manager's
 * Weekly Plan and Preview pages use, in the same readOnly+hideDiagnostics
 * mode Preview's own "Staff view" toggle already uses — no edit
 * controls, no under-target/double-booking warnings, but the vacancy
 * (red), leave (purple), and swap (blue/green) rings still show, same
 * as they do for managers, since those are meant to be visible to staff
 * too (see WeeklyPlanGrid.tsx's own comment on the red ring for why).
 *
 * Reachable from a "View full week" link on My Schedule — confirmed
 * with Oliver to be additive, not a replacement for the existing
 * single-day click-through (app/me/schedule/day/page.tsx).
 */
export default async function StaffWeeklyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const weekStartDate = params.week || weekStartFor(businessTodayIso());

  const data = await loadStaffWeeklyPlan(session.id, weekStartDate);

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/me/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; My Schedule
      </Link>
      <PageHeader
        title="Full Week Schedule"
        description={`Week of ${weekStartDate}. Who's working when — a read-only look, same as what your manager sees, minus the staffing-target warnings.`}
      />

      <div className="flex items-center gap-3 mb-4 text-sm">
        <Link href={`/me/schedule/week?week=${prevWeek}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr; Previous week
        </Link>
        <Link href={`/me/schedule/week?week=${nextWeek}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          Next week &rarr;
        </Link>
      </div>

      {!data ? (
        <EmptyState message="This week hasn't been published yet, so there's nothing to show." />
      ) : (
        <>
          {!data.viewerCanSeeCoworkers && (
            <div className="mb-4">
              <Banner tone="info" title="Coworker view is off" description="Your restaurant's settings only show you your own schedule here, not coworkers'." />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-[var(--ink-500)]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full ring-1 ring-[var(--danger)] bg-[var(--card)] inline-block" /> Slot opening up soon
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full ring-1 ring-purple-400 bg-[var(--card)] inline-block" /> Covering leave
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full ring-1 ring-[var(--primary-border)] bg-[var(--card)] inline-block" /> Shift swap — awaiting manager approval
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full ring-1 ring-[var(--success)] bg-[var(--card)] inline-block" /> Shift swap — completed
            </span>
          </div>

          <WeeklyPlanGrid data={data} readOnly hideDiagnostics />
        </>
      )}
    </main>
  );
}
