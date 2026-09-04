import Link from "next/link";
import { redirect } from "next/navigation";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { loadEmployeesList, loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { addDays, shiftWeek } from "@/lib/schedule/weekMath";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { loadScheduleLabor } from "@/lib/analytics/loadScheduleLabor";
import { WeeklyPlanGrid } from "@/app/schedule/WeeklyPlanGrid";
import { GenerateWeekButton } from "./GenerateWeekButton";
import { PublishedEditGate } from "./PublishedEditGate";
import { DangerZone } from "./DangerZone";
import { PageHeader, Card, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export default async function WeeklyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string }>;
}) {
  const params = await searchParams;
  // Bare /schedule/plan lands on the weeks list first (2026-08-27,
  // Oliver: "/schedule/plan land on /schedule/weeks first") — you pick
  // the week, then edit it. Deep links with ?week= are unaffected.
  if (!params.week) redirect("/schedule/weeks");
  const weekStartDate = params.week;
  const initialDay = params.day;

  const [data, employeeList, employeeAssignedPositionIds, canManage, labor] = await Promise.all([
    loadWeeklyPlan(weekStartDate),
    loadEmployeesList(),
    loadEmployeeAssignedPositionIds(),
    hasCapability("SCHEDULE_MANAGE"),
    // Whole week in one pass; loadScheduleLabor returns nothing at all
    // for a viewer without VIEW_ANALYTICS.
    loadScheduleLabor(weekStartDate, addDays(weekStartDate, 6)),
  ]);

  const activeEmployees = employeeList
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.nickname, primaryPositionId: e.primaryPositionId }));

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      {/* Back goes to the weeks list, not the hub — since 2026-08-27
          weeks IS the way in here, so back retraces the actual path
          (Oliver: "schedule/plan back nav to schedule/week"). */}
      <Link href="/schedule/weeks" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Weeks
      </Link>

      <PageHeader
        title="Weekly Plan"
        description={`Week of ${data.dates[0]} to ${data.dates[6]}. Once published, this week auto-fills the roster when you create each day's actual shift — no re-entering names.`}
        actions={
          data.week ? (
            data.week.status === "published" ? (
              <Badge tone="success">Published</Badge>
            ) : (
              <Badge tone="warning">Draft</Badge>
            )
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
        <Link href={`/schedule/plan?week=${prevWeek}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          &larr; Previous week
        </Link>
        <Link href={`/schedule/plan?week=${nextWeek}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Next week &rarr;
        </Link>
        <span className="text-[var(--border-strong)]">|</span>
        <Link href={`/schedule/plan/month?month=${weekStartDate}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Zoom out to month view
        </Link>
        <Link href={`/schedule/plan/person?month=${weekStartDate}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          View by person
        </Link>
        {/* "All weeks" used to sit here; the back link above covers it now. */}
      </div>

      {!data.week ? (
        <EmptyState
          message={
            canManage
              ? "This week hasn't been planned yet. Generate it from your template assignments, then adjust the exceptions."
              : "This week hasn't been planned yet."
          }
          action={canManage ? <GenerateWeekButton weekStartDate={weekStartDate} /> : undefined}
        />
      ) : !canManage ? (
        // View-only (2026-08-24): every manager can see the plan, but
        // only SCHEDULE_MANAGE holders get any edit control. Same
        // readOnly grid mode PublishedEditGate's locked state uses.
        <>
          <Card className="mb-6 !bg-[var(--paper)]">
            <p className="text-sm text-[var(--ink-500)]">
              View only — changing the schedule is done by whoever holds the schedule-management
              permission.
            </p>
          </Card>
          <WeeklyPlanGrid
            data={data}
            readOnly
            initialDate={initialDay}
            dailyLabor={labor.dailyLabor}
            laborTargetPct={labor.laborTargetPct}
            laborShowAmounts={labor.showAmounts}
          />
        </>
      ) : (
        <>
          {data.week.status === "draft" && (
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 !bg-[var(--paper)]">
              <p className="text-sm text-[var(--ink-500)]">
                Still a draft — only managers can see this until it&apos;s published.
              </p>
              <LinkButton href={`/schedule/plan/preview?week=${weekStartDate}`} variant="brand" size="sm">
                Preview &amp; Publish
              </LinkButton>
            </Card>
          )}

          <PublishedEditGate
            isPublished={data.week.status === "published"}
            data={data}
            weekId={data.week.id}
            allEmployees={activeEmployees}
            employeeAssignedPositionIds={employeeAssignedPositionIds}
            initialDate={initialDay}
            dailyLabor={labor.dailyLabor}
            laborTargetPct={labor.laborTargetPct}
            laborShowAmounts={labor.showAmounts}
          />

          <DangerZone
            weekId={data.week.id}
            dates={data.dates}
            status={data.week.status}
            totalAssignments={data.assignments.length}
          />
        </>
      )}
    </main>
  );
}
