import Link from "next/link";
import { requireManager } from "@/lib/auth/guard";
import { loadUnseenLeaveRequestCount } from "@/lib/schedule/loadLeaveRequests";
import { loadUnseenSwapCount } from "@/lib/schedule/loadSwapRequests";
import { toIso } from "@/lib/schedule/weekMath";

/** Small inline count badge for a hub tile -- same visual language as
 * the nav's UnseenBadge (NavBarClient.tsx) but kept local here rather
 * than shared, since this one sits inline after a heading instead of
 * absolutely positioned in a nav row. Queued 2026-08-16 (Oliver: "leave
 * request card show red pill noti as well"), shipped together with the
 * shift-swap portal since that's what it got bundled into. */
function TileBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-medium leading-none align-middle">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Landing page for the Schedule Planner (Phase 1, 2026-08-11) — see
 * Atlas_Schedule_Planner_Schema_v1.md for the full design. This page will
 * eventually become the actual weekly grid (Phase 2); for now it's just a
 * hub linking to the two foundation pieces that phase builds on top of.
 *
 * Leave requests tile added 2026-08-16 (Phase D, shipped). Shift swaps
 * tile + unseen-count badges on both tiles added later the same day
 * (Phase E, shipped) — the badges reuse the exact counts already
 * powering the nav's red pill. */
export default async function SchedulePage() {
  const session = await requireManager();
  const today = toIso(new Date());
  const [unseenLeaveCount, unseenSwapCount] = await Promise.all([
    loadUnseenLeaveRequestCount(session.id, today),
    loadUnseenSwapCount(session.id, today),
  ]);

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Schedule Planner</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Plan a week&apos;s schedule from your recurring templates, adjust it, and publish it.
      </p>

      <div className="grid sm:grid-cols-3 gap-4">
        <Link
          href="/schedule/plan"
          className="block border rounded p-4 hover:bg-neutral-50 sm:col-span-3"
        >
          <h2 className="font-medium mb-1">Weekly plan</h2>
          <p className="text-sm text-neutral-500">
            Build, publish, and adjust a specific week&apos;s schedule — generated from your
            template assignments, with exceptions handled per week.
          </p>
        </Link>
        <Link
          href="/schedule/leave"
          className="block border rounded p-4 hover:bg-neutral-50 sm:col-span-3"
        >
          <h2 className="font-medium mb-1 flex items-center">
            Leave requests
            <TileBadge count={unseenLeaveCount} />
          </h2>
          <p className="text-sm text-neutral-500">
            Upcoming leave staff have logged themselves — shows up as a flag on the Weekly Plan
            grid too, so nothing catches you by surprise.
          </p>
        </Link>
        <Link
          href="/schedule/swaps"
          className="block border rounded p-4 hover:bg-neutral-50 sm:col-span-3"
        >
          <h2 className="font-medium mb-1 flex items-center">
            Shift swaps
            <TileBadge count={unseenSwapCount} />
          </h2>
          <p className="text-sm text-neutral-500">
            Staff-to-staff swap requests for upcoming shifts — swaps due within 3 days need your
            approval, further out they just notify you once accepted.
          </p>
        </Link>
        <Link
          href="/schedule/plan/month"
          className="block border rounded p-4 hover:bg-neutral-50 sm:col-span-2"
        >
          <h2 className="font-medium mb-1">Month overview</h2>
          <p className="text-sm text-neutral-500">
            Zoom out across the whole month — see which days are short-staffed, including weeks
            you haven&apos;t built yet (projected from your templates).
          </p>
        </Link>
        <Link
          href="/schedule/plan/person"
          className="block border rounded p-4 hover:bg-neutral-50"
        >
          <h2 className="font-medium mb-1">Person schedule</h2>
          <p className="text-sm text-neutral-500">
            Zoom in on one person — see their shifts across a month at a glance.
          </p>
        </Link>
        <Link
          href="/schedule/weeks"
          className="block border rounded p-4 hover:bg-neutral-50 sm:col-span-3"
        >
          <h2 className="font-medium mb-1">Weeks</h2>
          <p className="text-sm text-neutral-500">
            Every week at a glance — published, still draft, or not planned yet — for quick
            navigation without clicking through one at a time.
          </p>
        </Link>
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
