import Link from "next/link";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { notFound } from "next/navigation";
import { loadRosterPageData } from "@/lib/shift/loadRosterPageData";
import { RosterGrid } from "./RosterGrid";
import { NextToClosingReport } from "./NextToClosingReport";
import { RosterFooterActions } from "./RosterFooterActions";
import { ShiftStageNav } from "../ShiftStageNav";
import { Banner } from "@/components/ui/Banner";
import { StatusBadge } from "@/components/ui/Badge";
import { formatDayLabelLong, formatDayLabelShort } from "@/lib/format/formatDayLabel";
import { formatDateTime } from "@/lib/formatDateTime";

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
        {/* Straight back to this shift's month (2026-08-25, Oliver: "add
            back button") -- /shifts alone landed on the year picker, one
            hop short of where the manager came from. */}
        <Link href={`/shifts?month=${data.shift.date.slice(0, 7)}`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          ← Back to {data.shift.date.slice(0, 7)}
        </Link>
      </p>
      <div className="flex items-center gap-2.5 mb-1">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">
          {/* Long date (Oliver, 2026-08-24), same pair as the Reports
              heading: full weekday on sm+, short on a phone. */}
          <span className="hidden sm:inline">Roster — {formatDayLabelLong(data.shift.date)} ({data.shift.period})</span>
          <span className="sm:hidden">Roster — {formatDayLabelShort(data.shift.date)} ({data.shift.period})</span>
        </h1>
        <StatusBadge status={data.shift.status === "finalized" ? "finalized" : "draft"} />
      </div>
      {/* Who opened this shift (2026-08-26, Oliver: "should we add column
          said created by ... or has info pop up?" -- a visible caption,
          not a popup: hidden info is info nobody sees). Blank for shifts
          created before the column existed. */}
      {data.shift.createdByName && (
        <p className="text-xs text-[var(--ink-500)] -mt-0.5 mb-2">
          Created by {data.shift.createdByName}
          {data.shift.createdAt ? ` — ${formatDateTime(data.shift.createdAt)}` : ""}
        </p>
      )}
      <ShiftStageNav shiftId={shiftId} current="roster" />

      {isFinalized && (
        <div className="mt-4 mb-6">
          <Banner tone="warning" title="This shift is finalized — the roster is locked." />
          <p className="text-sm mt-2">
            <Link href={`/shifts/${shiftId}/summary`} className={`text-[var(--primary)] font-medium hover:underline ${TAP_TARGET_PAD}`}>
              View the Summary Report →
            </Link>
          </p>
        </div>
      )}

      <section className="mt-6 mb-8">
        <h2 className="text-xl font-semibold text-[var(--ink-900)] mb-1">On the roster ({data.roster.length})</h2>
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
          marks={data.marks}
          weekShiftCounts={data.weekShiftCounts}
        />
      </section>

      <div className="mb-4">
        <NextToClosingReport
          shiftId={shiftId}
        // Finalized shifts skip the warning: the roster is locked, there is
        // nothing left to fix here.
        understaffed={
          isFinalized
            ? []
            : data.allPositions
                .map((p) => {
                  const target = data.targets[p.id] ?? 0;
                  const count = data.roster.filter((r) => r.positionId === p.id).length;
                  return target > 0 && count < target ? `${p.name} ${count}/${target}` : null;
                })
                .filter((x): x is string => x !== null)
        }
      />
      </div>

      {/* Done + Delete (2026-08-25, Oliver). Rendered on draft shifts
          only: a finalized roster is read-only and its banner already
          links onward to the Summary. */}
      {!isFinalized && (
        <RosterFooterActions
          shiftId={shiftId}
          monthHref={`/shifts?month=${data.shift.date.slice(0, 7)}`}
          shiftLabel={`${data.shift.date} (${data.shift.period})`}
        />
      )}
    </main>
  );
}
