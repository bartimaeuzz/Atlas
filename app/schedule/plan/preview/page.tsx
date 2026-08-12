import Link from "next/link";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { WeeklyPlanGrid } from "../WeeklyPlanGrid";
import { PublishWeekButton } from "../PublishWeekButton";

/** Safety-check step between the editable draft grid and actually
 * publishing (2026-08-11, Oliver). Two views, toggled by ?view=:
 *   - "manager" (default): read-only version of the same grid, keeps
 *     all the diagnostics (red under-target, orange double-booking) so
 *     problems are still visible right before locking the week in.
 *   - "staff": what employees will actually see once this is
 *     published — no manager-only warnings, just who's working when.
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

  const data = await loadWeeklyPlan(weekStartDate);

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
          ? "Same warnings you see while editing — understaffed slots and double-bookings — so you can catch problems before publishing."
          : "What employees will see once this is published — no manager-only warnings."}
      </p>

      <WeeklyPlanGrid data={data} readOnly hideDiagnostics={view === "staff"} />

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
