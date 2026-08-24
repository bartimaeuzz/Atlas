import Link from "next/link";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { loadEmployeesList, loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { weekStartFor, toIso, shiftWeek } from "@/lib/schedule/weekMath";
import { GenerateWeekButton } from "./GenerateWeekButton";
import { PublishedEditGate } from "./PublishedEditGate";
import { DangerZone } from "./DangerZone";
import { PageHeader, Card, EmptyState } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export default async function WeeklyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const weekStartDate = params.week || weekStartFor(toIso(new Date()));

  const [data, employeeList, employeeAssignedPositionIds] = await Promise.all([
    loadWeeklyPlan(weekStartDate),
    loadEmployeesList(),
    loadEmployeeAssignedPositionIds(),
  ]);

  const activeEmployees = employeeList
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.nickname, primaryPositionId: e.primaryPositionId }));

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Schedule Planner
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
        <Link href={`/schedule/plan?week=${prevWeek}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr; Previous week
        </Link>
        <Link href={`/schedule/plan?week=${nextWeek}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          Next week &rarr;
        </Link>
        <span className="text-[var(--border-strong)]">|</span>
        <Link href={`/schedule/plan/month?month=${weekStartDate}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          Zoom out to month view
        </Link>
        <Link href={`/schedule/plan/person?month=${weekStartDate}`} className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          View by person
        </Link>
        <Link href="/schedule/weeks" className="text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          All weeks
        </Link>
      </div>

      {!data.week ? (
        <EmptyState
          message="This week hasn't been planned yet. Generate it from your template assignments, then adjust the exceptions."
          action={<GenerateWeekButton weekStartDate={weekStartDate} />}
        />
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
