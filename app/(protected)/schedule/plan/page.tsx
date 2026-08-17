import Link from "next/link";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { loadEmployeesList, loadAllPositionsForAssignment, loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { weekStartFor, toIso, shiftWeek } from "@/lib/schedule/weekMath";
import { GenerateWeekButton } from "./GenerateWeekButton";
import { PublishedEditGate } from "./PublishedEditGate";
import { DangerZone } from "./DangerZone";

export default async function WeeklyPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const weekStartDate = params.week || weekStartFor(toIso(new Date()));

  const [data, employeeList, allPositions, employeeAssignedPositionIds] = await Promise.all([
    loadWeeklyPlan(weekStartDate),
    loadEmployeesList(),
    loadAllPositionsForAssignment(),
    loadEmployeeAssignedPositionIds(),
  ]);

  const activeEmployees = employeeList
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.nickname, primaryPositionId: e.primaryPositionId }));
  const activePositions = allPositions.filter((p) => p.active);

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-semibold">Weekly Plan</h1>
        {data.week && (
          <span
            className={
              "text-xs px-2 py-1 rounded font-medium " +
              (data.week.status === "published" ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600")
            }
          >
            {data.week.status === "published" ? "Published" : "Draft"}
          </span>
        )}
      </div>
      <p className="text-neutral-500 text-sm mb-4">
        Week of {data.dates[0]} to {data.dates[6]}. Once published, this week auto-fills the roster
        when you create each day&apos;s actual shift — no re-entering names.
      </p>

      <div className="flex items-center gap-3 mb-6 text-sm">
        <Link href={`/schedule/plan?week=${prevWeek}`} className="text-neutral-500 hover:text-black underline">
          &larr; Previous week
        </Link>
        <Link href={`/schedule/plan?week=${nextWeek}`} className="text-neutral-500 hover:text-black underline">
          Next week &rarr;
        </Link>
        <span className="text-neutral-300">|</span>
        <Link href={`/schedule/plan/month?month=${weekStartDate}`} className="text-neutral-500 hover:text-black underline">
          Zoom out to month view
        </Link>
        <Link href={`/schedule/plan/person?month=${weekStartDate}`} className="text-neutral-500 hover:text-black underline">
          View by person
        </Link>
        <Link href="/schedule/weeks" className="text-neutral-500 hover:text-black underline">
          All weeks
        </Link>
      </div>

      {!data.week ? (
        <div className="border rounded p-6 text-center">
          <p className="text-sm text-neutral-500 mb-4">
            This week hasn&apos;t been planned yet. Generate it from your template assignments,
            then adjust the exceptions.
          </p>
          <GenerateWeekButton weekStartDate={weekStartDate} />
        </div>
      ) : (
        <>
          {data.week.status === "draft" && (
            <div className="mb-6 flex items-center justify-between border rounded p-3 bg-neutral-50">
              <p className="text-sm text-neutral-500">
                Still a draft — only managers can see this until it&apos;s published.
              </p>
              <Link
                href={`/schedule/plan/preview?week=${weekStartDate}`}
                className="bg-black text-white px-4 py-1.5 rounded hover:bg-neutral-800 text-sm"
              >
                Preview &amp; Publish
              </Link>
            </div>
          )}

          <PublishedEditGate
            isPublished={data.week.status === "published"}
            data={data}
            weekId={data.week.id}
            allEmployees={activeEmployees}
            allPositions={activePositions}
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
