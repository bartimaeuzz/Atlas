import Link from "next/link";

/** Landing page for the Schedule Planner (Phase 1, 2026-08-11) — see
 * Atlas_Schedule_Planner_Schema_v1.md for the full design. This page will
 * eventually become the actual weekly grid (Phase 2); for now it's just a
 * hub linking to the two foundation pieces that phase builds on top of. */
export default function SchedulePage() {
  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Schedule Planner</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Phase 1 of the schedule planner — the foundation the weekly grid, staff-facing schedule
        view, leave requests, and shift-swap portal will build on top of next.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/schedule/targets"
          className="block border rounded p-4 hover:bg-neutral-50"
        >
          <h2 className="font-medium mb-1">Staffing targets</h2>
          <p className="text-sm text-neutral-500">
            How many of each position you need, by day of week and period (Lunch/Dinner).
          </p>
        </Link>
        <Link
          href="/schedule/templates"
          className="block border rounded p-4 hover:bg-neutral-50"
        >
          <h2 className="font-medium mb-1">Template assignments</h2>
          <p className="text-sm text-neutral-500">
            Who normally works which position, day, and period — the recurring baseline a week's
            plan gets built from.
          </p>
        </Link>
      </div>
    </main>
  );
}
