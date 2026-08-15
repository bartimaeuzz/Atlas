"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoFillWeek, type AutoFillActionState } from "@/lib/actions/schedule";

/** "Auto-fill understaffed slots" (2026-08-15, Oliver's ask) -- one
 * click fills every position/date/period slot in this week that's below
 * its staffing target. No smart rules yet ("i will add it up later
 * after i sure how to do it we will disscuss about that later") --
 * right now it only guarantees the one rule Oliver gave: never the same
 * person twice in one day. See autoFillWeek's own comment in
 * lib/actions/schedule.ts for the full eligible-pool / tie-break logic
 * confirmed with him beforehand.
 *
 * Lives inside PublishedEditGate's unlocked view, same as "Add to a
 * slot" -- it's another way of adding assignments, so it should be
 * behind the same "you're about to edit a published schedule"
 * awareness rather than bypassing it. */
export function AutoFillWeekButton({ weekId }: { weekId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<AutoFillActionState | null>(null);

  return (
    <div className="mb-8 border rounded p-4 bg-neutral-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">Auto-fill understaffed slots</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Fills every slot below its staffing target for the whole week. Only rule right now: never
            the same person twice in one day.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await autoFillWeek(weekId);
              setResult(res);
              router.refresh();
            })
          }
          className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50 shrink-0"
        >
          {isPending ? "Filling…" : "Auto-fill week"}
        </button>
      </div>

      {result?.error && (
        <div className="mt-3 border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">{result.error}</div>
      )}

      {result?.summary && !result.error && (
        <div className="mt-3 border border-green-300 bg-green-50 text-green-800 rounded p-3 text-sm">
          {result.summary.filled === 0 && result.summary.totalSkipped === 0 ? (
            "Nothing to fill — every slot already meets its target."
          ) : (
            <>
              Filled {result.summary.filled} slot{result.summary.filled === 1 ? "" : "s"}.
              {result.summary.totalSkipped > 0 && (
                <>
                  {" "}
                  {result.summary.totalSkipped} slot{result.summary.totalSkipped === 1 ? "" : "s"} still need
                  someone — nobody was free that day.
                </>
              )}
            </>
          )}
          {result.summary.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-green-900/80 list-disc list-inside">
              {result.summary.skipped.map((s, i) => (
                <li key={i}>
                  {s.positionName} — {s.date} {s.period} (short {s.missing})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
