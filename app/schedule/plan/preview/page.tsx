import Link from "next/link";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { loadEmployeesList, loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { WeeklyPlanGrid } from "../WeeklyPlanGrid";
import { PublishWeekButton } from "../PublishWeekButton";

/** Safety-check step between the editable draft grid and actually
 * publishing (2026-08-11, Oliver). Two views, toggled by ?view=:
 *   - "manager" (default): same grid, still fully EDITABLE (2026-08-11
 *     follow-up — Oliver: reviewing the preview shouldn't force a trip
 *     back to /schedule/plan to fix something he noticed here). Keeps
 *     all the diagnostics too (red under-target, orange double-
 *     booking, red vacancy) so problems are visible right here.
 *   - "staff": what employees will actually see once this is
 *     published — read-only (this is meant to mirror the real staff
 *     view, not a second editing surface) and no manager-only
 *     warnings.
 * Both reuse WeeklyPlanGrid's readOnly/hideDiagnostics modes rather
 * than a second component, so this view can never drift from the real
 * grid's data or layout. */
export default async function WeeklyPlanPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>;
}) {
  const params = await searchParams;
  const weekStartDate = params.week;
  const view = params.view === "staff" ? "staff" : "manager";

  if (!weekStartDate) {
    return (
      <main className="max-w-5xl mx-auto p-8 font-sans">
        <p className="text-sm text-neutral-500 mb-4">Missing week.</p>
        <Link href="/schedule/plan" className="text-sm text-neutral-500 hover:text-black underline">
          &larr; Back to Weekly Plan
        </Link>
      </main>
    );
  }

  const [data, employeeList, employeeAssignedPositionIds] = await Promise.all([
    loadWeeklyPlan(weekStartDate),
    loadEmployeesList(),
    loadEmployeeAssignedPositionIds(),
  ]);
  const activeEmployees = employeeList
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.name, primaryPositionId: e.primaryPositionId }));

  if (!data.week) {
    return (
      <main className="max-w-5xl mx-auto p-8 font-sans">
        <p className="text-sm text-neutral-500 mb-4">This week hasn&apos;t been generated yet.</p>
        <Link
          href={`/schedule/plan?week=${weekStartDate}`}
          className="text-sm text-neutral-500 hover:text-black underline"
        >
          &larr; Back to Weekly Plan
        </Link>
      </main>
    );
  }

  const week = data.week;

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href={`/schedule/plan?week=${weekStartDate}`} className="text-sm text-neutral-500 hover:text-black">
        &larr; Back to edit
      </Link>
      <div className="flex items-center justify-between mt-2 mb-1">
        <h1 className="text-2xl font-semibold">Preview</h1>
        <span
          className={
            "text-xs px-2 py-1 rounded font-medium " +
            (week.status === "published" ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600")
          }
        >
          {week.status === "published" ? "Published" : "Draft"}
        </span>
      </div>
      <p className="text-neutral-500 text-sm mb-4">
        Week of {data.dates[0]} to {data.dates[6]}.
      </p>

      <div className="flex items-center gap-2 mb-3 text-sm">
        <Link
          href={`/schedule/plan/preview?week=${weekStartDate}&view=manager`}
          className={
            "px-3 py-1.5 rounded border " +
            (view === "manager" ? "bg-black text-white border-black" : "text-neutral-600 hover:bg-neutral-50")
          }
        >
          Manager view
        </Link>
        <Link
          href={`/schedule/plan/preview?week=${weekStartDate}&view=staff`}
          className={
            "px-3 py-1.5 rounded border " +
            (view === "staff" ? "bg-black text-white border-black" : "text-neutral-600 hover:bg-neutral-50")
          }
        >
          Staff view
        </Link>
      </div>
      <p className="text-xs text-neutral-400 mb-6">
        {view === "manager"
          ? "Still fully editable — same warnings you see on the weekly grid (understaffed slots, double-bookings, vacating-soon) so you can catch and fix problems right here before publishing."
          : "Read-only — this is what employees will see once it's published, no manager-only warnings."}
      </p>

      <WeeklyPlanGrid
        data={data}
        weekId={week.id}
        allEmployees={activeEmployees}
        employeeAssignedPositionIds={employeeAssignedPositionIds}
        readOnly={view === "staff"}
        hideDiagnostics={view === "staff"}
      />

      {week.status === "draft" && (
        <div className="mt-8 flex items-center justify-between border rounded p-3 bg-neutral-50">
          <p className="text-sm text-neutral-500">
            Looks right? Publishing makes this visible to staff and starts auto-filling new shifts.
          </p>
          <PublishWeekButton weekId={week.id} />
        </div>
      )}
    </main>
  );
}
