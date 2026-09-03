"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoFillWeek, type AutoFillActionState, type AutoFillOnLeaveSkip } from "@/lib/actions/schedule";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/** "Auto-fill understaffed slots" (2026-08-15, Oliver's ask) -- one
 * click fills every position/date/period slot in this week that's below
 * its staffing target. Restyled onto the design system 2026-08-18. */
/** One line per person rather than one per person-per-date: a manager
 * reads "who was left out", and the dates are the detail. */
function groupOnLeave(
  rows: AutoFillOnLeaveSkip[]
): { employeeId: number; employeeName: string; dates: string[] }[] {
  // Keyed by id, not nickname: `nickname` has no unique constraint, so two
  // active people can share one and would otherwise merge into one row.
  const byId = new Map<number, { employeeName: string; dates: string[] }>();
  for (const r of rows) {
    const entry = byId.get(r.employeeId) ?? { employeeName: r.employeeName, dates: [] };
    entry.dates.push(r.date);
    byId.set(r.employeeId, entry);
  }
  return [...byId.entries()]
    .map(([employeeId, e]) => ({ employeeId, employeeName: e.employeeName, dates: [...e.dates].sort() }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.employeeId - b.employeeId);
}

export function AutoFillWeekButton({ weekId }: { weekId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<AutoFillActionState | null>(null);

  return (
    <Card className="mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink-900)]">Auto-fill understaffed slots</h2>
          <p className="text-xs text-[var(--ink-500)] mt-0.5">
            Fills every slot below its staffing target for the whole week, using each person&apos;s
            primary role first, then anyone cross-trained for it. Never the same person twice in one
            day, never someone on approved leave, and never someone not linked to that position at
            all.
          </p>
        </div>
        <Button
          size="sm"
          loading={isPending}
          className="shrink-0"
          onClick={() =>
            startTransition(async () => {
              const res = await autoFillWeek(weekId);
              setResult(res);
              router.refresh();
            })
          }
        >
          {isPending ? "Filling…" : "Auto-fill week"}
        </Button>
      </div>

      {result?.error && (
        <div className="mt-3">
          <Banner tone="danger" title="Couldn't auto-fill" description={result.error} />
        </div>
      )}

      {result?.summary && !result.error && (
        <div className="mt-3">
          <Banner
            tone="success"
            title={
              result.summary.filled === 0 && result.summary.totalSkipped === 0
                ? "Nothing to fill — every slot already meets its target."
                : `Filled ${result.summary.filled} slot${result.summary.filled === 1 ? "" : "s"}.`
            }
            description={
              result.summary.totalSkipped > 0
                ? `${result.summary.totalSkipped} slot${result.summary.totalSkipped === 1 ? " still needs" : "s still need"} someone — nobody was free that day.`
                : undefined
            }
          />
          {result.summary.onLeaveSkipped.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-[var(--ink-900)]">Not scheduled — on leave</p>
              <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--ink-500)] list-disc list-inside">
                {groupOnLeave(result.summary.onLeaveSkipped).map((row) => (
                  <li key={row.employeeId}>
                    {row.employeeName} — {row.dates.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.summary.skipped.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-[var(--ink-900)]">Still short</p>
              <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--ink-500)] list-disc list-inside">
                {result.summary.skipped.map((s, i) => (
                  <li key={i}>
                    {s.positionName} — {s.date} {s.period} (short {s.missing})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
