"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoFillWeek, type AutoFillActionState } from "@/lib/actions/schedule";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/** "Auto-fill understaffed slots" (2026-08-15, Oliver's ask) -- one
 * click fills every position/date/period slot in this week that's below
 * its staffing target. Restyled onto the design system 2026-08-18. */
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
            day, and never someone not linked to that position at all.
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
                ? `${result.summary.totalSkipped} slot${result.summary.totalSkipped === 1 ? "" : "s"} still need someone — nobody was free that day.`
                : undefined
            }
          />
          {result.summary.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--ink-500)] list-disc list-inside">
              {result.summary.skipped.map((s, i) => (
                <li key={i}>
                  {s.positionName} — {s.date} {s.period} (short {s.missing})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
