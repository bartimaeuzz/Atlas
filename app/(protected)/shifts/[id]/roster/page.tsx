import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRosterPageData } from "@/lib/shift/loadRosterPageData";
import { RosterGrid } from "./RosterGrid";
import { LinkButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { StatusBadge } from "@/components/ui/Badge";

/** Redesigned 2026-08-11 (Oliver: wanted this to read like the Schedule
 * Planner's weekly grid) — a Position-per-row layout with headcount
 * targets and an inline "+ Add" dropdown per position, instead of a flat
 * employee list plus a separate form below it. This is deliberately the
 * LAST-MINUTE, day-of adjustment surface: the weekly plan (if published)
 * already auto-seeds this roster, this page is for fixing it right before
 * the closing report — someone called out, a manager added extra coverage,
 * etc. See RosterGrid.tsx for the grid itself.
 *
 * Restyled 2026-08-16 onto design-system-v2 tokens/components. */
export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadRosterPageData(shiftId);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <p className="text-sm mb-2">
        <Link href="/shifts" className="text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          ← All shifts
        </Link>
      </p>
      <div className="flex items-center gap-2.5 mb-1">
        <h1 className="text-[24px] font-bold text-[var(--ink-900)]">
          Roster — {data.shift.date} ({data.shift.period})
        </h1>
        <StatusBadge status={data.shift.status === "finalized" ? "finalized" : "draft"} />
      </div>

      {isFinalized && (
        <div className="mt-4 mb-6">
          <Banner tone="warning" title="This shift is finalized — the roster is locked." />
          <p className="text-sm mt-2">
            <Link href={`/shifts/${shiftId}/summary`} className="text-[var(--primary)] font-medium hover:underline">
              View the Summary Report →
            </Link>
          </p>
        </div>
      )}

      <section className="mt-6 mb-8">
        <h2 className="text-[19px] font-semibold text-[var(--ink-900)] mb-1">On the roster ({data.roster.length})</h2>
        {!isFinalized && (
          <p className="text-xs text-[var(--ink-500)] mb-3">
            Point value adjustments happen later, on the Closing Report page right before Save — not here. This page is just
            who&apos;s working today.
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

      <LinkButton href={`/shifts/${shiftId}/closing-report`}>
        Next: Closing Report →
      </LinkButton>
    </main>
  );
}
