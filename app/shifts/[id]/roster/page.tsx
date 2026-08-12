import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRosterPageData } from "@/lib/shift/loadRosterPageData";
import { RosterGrid } from "./RosterGrid";

/** Redesigned 2026-08-11 (Oliver: wanted this to read like the Schedule
 * Planner's weekly grid) — a Position-per-row layout with headcount
 * targets and an inline "+ Add" dropdown per position, instead of a flat
 * employee list plus a separate form below it. This is deliberately the
 * LAST-MINUTE, day-of adjustment surface: the weekly plan (if published)
 * already auto-seeds this roster, this page is for fixing it right before
 * the closing report — someone called out, a manager added extra coverage,
 * etc. See RosterGrid.tsx for the grid itself. */
export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadRosterPageData(shiftId);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/shifts" className="text-neutral-500 hover:underline">← All shifts</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Roster — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-6">Status: {data.shift.status}</p>

      {isFinalized && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm mb-6">
          This shift is finalized — the roster is locked.{" "}
          <Link href={`/shifts/${shiftId}/summary`} className="underline">View the Summary Report →</Link>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">On the roster ({data.roster.length})</h2>
        {!isFinalized && (
          <p className="text-xs text-neutral-500 mb-3">
            Point value adjustments happen later, on the Closing Report page right before Save —
            not here. This page is just who&apos;s working today.
          </p>
        )}
        <RosterGrid
          shiftId={shiftId}
          positions={data.allPositions}
          roster={data.roster}
          targets={data.targets}
          allEmployees={data.allEmployees}
          employeeAssignedPositionIds={data.employeeAssignedPositionIds}
          readOnly={isFinalized}
        />
      </section>

      <Link
        href={`/shifts/${shiftId}/closing-report`}
        className="inline-block bg-neutral-900 text-white px-4 py-2 rounded hover:bg-neutral-800"
      >
        Next: Closing Report →
      </Link>
    </main>
  );
}
