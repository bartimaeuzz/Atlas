"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";
import {
  deleteSalesTargetOverride,
  saveSalesTargetOverride,
  saveWeekdaySalesTargets,
  type SalesTargetsState,
} from "@/lib/actions/salesTargets";
import type { SalesTargetDateOverride } from "@/lib/analytics/loadSalesTargets";
import { formatDayLabel } from "@/lib/format/formatDayLabel";

// Indexed BY dayOfWeek value, so this stays in JS 0=Sun..6=Sat order — the
// same convention the database column and every date helper use.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Displayed Monday-first, matching /schedule/targets and weekMath.ts's own
// Monday-Sunday week (2026-08-30, Oliver). Only the display order changes;
// the values written to the database stay 0=Sun..6=Sat.
const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

const initialState: SalesTargetsState = { error: null };

/** Two forms, not one. The seven weekday defaults are a single decision
 * with a single Save; a dated exception is added and removed one at a
 * time. Merging them would mean either a Save button that quietly rewrites
 * the week while you were adding one holiday, or per-row saves on the week
 * that nobody asked for. */
export function SalesTargetsForm({
  weekday,
  dates,
}: {
  weekday: Record<number, number>;
  dates: SalesTargetDateOverride[];
}) {
  return (
    <div className="space-y-10">
      <WeekdayTargets weekday={weekday} />
      <DateOverrides dates={dates} />
    </div>
  );
}

function WeekdayTargets({ weekday }: { weekday: Record<number, number> }) {
  const [state, formAction, isPending] = useActionState(saveWeekdaySalesTargets, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  const justSaved = useSavedFlash(state.savedAt);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Every week</h2>
        <p className="text-sm text-[var(--ink-500)] mt-0.5">
          The number you normally aim for on each day. Blank means that day has no target and is
          not called good or bad.
        </p>
      </div>

      {state.error && (
        <Banner tone="danger" title="That did not save" description={state.error} />
      )}

      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
        {DAYS.map((day) => (
          <label key={day} className="flex items-center justify-between gap-4 px-3 py-2.5">
            <span className="text-sm text-[var(--ink-900)]">{DAY_NAMES[day]}</span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-sm text-[var(--ink-500)]">
                $
              </span>
              {/* type="text" with a numeric keypad, not type="number": the
                  action accepts "3,800" and "$3,800" as readily as "3800",
                  and a number input silently discards a typed comma, which
                  turns 3,800 into an empty box in front of someone who has
                  no idea why. inputMode still brings up the phone keypad. */}
              <input
                type="text"
                inputMode="decimal"
                name={`weekday-${day}`}
                // Not rounded for display: re-saving an untouched form
                // must hand back exactly what is stored, or a $3,800.50
                // target quietly becomes $3,801 on the next unrelated save.
                defaultValue={weekday[day] != null ? String(weekday[day]) : ""}
                placeholder="no target"
                aria-label={`${DAY_NAMES[day]} sales target in dollars`}
                className="w-32 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 text-right tabular-nums text-[var(--ink-900)]"
              />
            </span>
          </label>
        ))}
      </div>

      <Button type="submit" loading={isPending}>
        {justSaved ? "Saved ✓" : "Save weekly targets"}
      </Button>
    </form>
  );
}

function DateOverrides({ dates }: { dates: SalesTargetDateOverride[] }) {
  const [state, formAction, isPending] = useActionState(saveSalesTargetOverride, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  const justSaved = useSavedFlash(state.savedAt);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">One-off days</h2>
        <p className="text-sm text-[var(--ink-500)] mt-0.5">
          A date that is not a normal day — a holiday, a buyout, the week the street is dug up. The
          number here is used instead of that weekday&apos;s usual target. Remove it and the usual
          one comes back.
        </p>
      </div>

      {dates.length > 0 && (
        <ul className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
          {dates.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm text-[var(--ink-900)] tabular-nums">
                  {formatDayLabel(d.date)}
                </span>
                {d.label && <span className="block text-xs text-[var(--ink-500)] truncate">{d.label}</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-sm tabular-nums text-[var(--ink-900)]">
                  ${Math.round(d.netSalesTarget).toLocaleString("en-US")}
                </span>
                <RemoveOverrideButton date={d.date} label={d.label} />
              </span>
            </li>
          ))}
        </ul>
      )}

      {state.error && <Banner tone="danger" title="That did not save" description={state.error} />}

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="block text-[var(--ink-500)] mb-1">Date</span>
            <input
              type="date"
              name="date"
              required
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[var(--ink-900)]"
            />
          </label>
          <label className="text-sm">
            <span className="block text-[var(--ink-500)] mb-1">Target</span>
            <input
              type="text"
              inputMode="decimal"
              name="amount"
              required
              placeholder="6,000"
              className="w-32 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 text-right tabular-nums text-[var(--ink-900)]"
            />
          </label>
          <label className="text-sm grow min-w-[10rem]">
            <span className="block text-[var(--ink-500)] mb-1">Reason (optional)</span>
            <input
              type="text"
              name="label"
              maxLength={40}
              placeholder="Thanksgiving"
              className="w-full min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[var(--ink-900)]"
            />
          </label>
        </div>
        <Button type="submit" variant="secondary" loading={isPending}>
          {justSaved ? "Added ✓" : "Add this day"}
        </Button>
      </form>
    </section>
  );
}

function RemoveOverrideButton({ date, label }: { date: string; label: string | null }) {
  const [state, formAction, isPending] = useActionState(deleteSalesTargetOverride, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="date" value={date} />
      <Button
        type="submit"
        variant="destructive-outline"
        size="sm"
        loading={isPending}
        aria-label={`Remove the target for ${label ? `${label}, ` : ""}${formatDayLabel(date)}`}
      >
        Remove
      </Button>
      {/* Inline rather than a banner at the top: the thing that failed is
          this row, and a message about it three sections above is a message
          about nothing in particular. */}
      {state.error && <span className="sr-only">{state.error}</span>}
    </form>
  );
}

/** "Saved ✓" on the button itself for two seconds. A banner at the top of
 * the page is the wrong place — on a phone the save button can be a screen
 * and a half below it, so the one thing that confirms the tap worked would
 * be off screen (2026-08-31, Aey, on the staffing-targets form). */
function useSavedFlash(savedAt: number | undefined): boolean {
  const [cleared, setCleared] = useState<number | null>(null);
  useEffect(() => {
    if (!savedAt || savedAt === cleared) return;
    const t = setTimeout(() => setCleared(savedAt), 2000);
    return () => clearTimeout(t);
  }, [savedAt, cleared]);
  return !!savedAt && savedAt !== cleared;
}
