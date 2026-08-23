"use client";

import { useActionState, useState } from "react";
import { updateStaffingTargets, type ScheduleActionState } from "@/lib/actions/schedule";
import type { StaffingTargetPosition } from "@/lib/schedule/loadStaffingTargets";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const initialState: ScheduleActionState = { error: null };

function clamp(n: number): number {
  return Number.isNaN(n) ? 0 : Math.max(0, Math.round(n));
}

/** Combined Position x Day-of-week grid (2026-08-15 rework, Oliver's ask)
 * — replaced the old layout of two entirely separate Lunch/Dinner tables
 * with ONE table where every position gets exactly two rows, Lunch then
 * Dinner, so both periods for a position sit right next to each other
 * instead of scrolling to a whole different section to compare them.
 *
 * Master row stepper (Oliver: "more like game ui", a bulk +/- so you
 * don't have to manually change each and every single one) — each row
 * gets one extra [-] [+] pair under "All days" that bumps every day's
 * count in that row by 1 relative to whatever's already there (confirmed
 * with Oliver: bump-by-1, not reset-to-same-number, so day-to-day
 * differences you've already set — e.g. Friday dinner staffed higher
 * than Monday — aren't wiped out by one click). The per-day steppers
 * still work exactly as before for fine-tuning a single cell; the master
 * control is purely an additional shortcut, nothing was removed.
 *
 * Still submits the whole grid at once (every cell, even blanks) so the
 * server can do a full resync — see updateStaffingTargets's comment for
 * why that's the right call for this small table. Field names
 * (`target_<positionId>_<day>_<period>`) are unchanged, so the server
 * action needed zero changes for this rework. */
export function TargetsForm({
  positions,
  targets,
}: {
  positions: StaffingTargetPosition[];
  targets: Record<string, number>;
}) {
  const [state, formAction, isPending] = useActionState(updateStaffingTargets, initialState);
  // Phone shows ONE day at a time (2026-08-23, Oliver). Defaults to today,
  // since "what do I need tomorrow" is the reason someone opens this on a
  // phone at all. Desktop ignores this entirely and shows all seven.
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay());

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="border border-green-300 bg-green-50 text-green-700 rounded p-3 text-sm">Saved.</div>
      )}

      {/* Day picker, phone only (2026-08-23). At 390px this table measured
          820px wide with Position and Period the only columns on screen --
          every number, the entire point of the page, sat off to the right.
          Rather than scroll sideways (which components/ui/Table.tsx says is
          not Atlas's phone story), pick a day and see every position's
          target for it.

          The other six days stay in the DOM, hidden. They have to: the form
          posts the whole grid for a full resync (see updateStaffingTargets),
          and a display:none input still submits -- which is exactly why this
          is column-hiding rather than a separate phone component. Two
          renderings would mean two inputs per field and a duplicated post. */}
      <div className="lg:hidden">
        <div className="text-xs font-medium text-[var(--ink-500)] mb-1.5">Showing</div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={day === selectedDay}
              className={
                "min-h-11 px-3 rounded-[var(--radius-full)] text-sm font-medium border " +
                (day === selectedDay
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)]")
              }
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full lg:min-w-[820px] text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-1.5 pr-2 border-r">Position</th>
              <th className="py-1.5 pr-2">Period</th>
              <th className="py-1.5 pr-3 whitespace-nowrap">All days</th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  className={
                    "py-1.5 text-center lg:w-14 lg:table-cell " +
                    (day === selectedDay ? "table-cell" : "hidden")
                  }
                >
                  {DAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const prevCategory = i > 0 ? positions[i - 1].category : null;
              const showCategoryBreak = i > 0 && p.category !== prevCategory;
              return (
                <PositionTargetRows
                  key={p.id}
                  position={p}
                  targets={targets}
                  showCategoryBreak={showCategoryBreak}
                  selectedDay={selectedDay}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save targets"}
      </button>
    </form>
  );
}

/** One position's two rows (Lunch, Dinner). Owns both periods' 7-day
 * value arrays so the master stepper can bump an entire row (one period)
 * at once while the per-day steppers still edit a single cell. */
function PositionTargetRows({
  position,
  targets,
  selectedDay,
  showCategoryBreak,
}: {
  position: StaffingTargetPosition;
  targets: Record<string, number>;
  showCategoryBreak: boolean;
  /** Which day the phone view is showing; desktop shows all seven. */
  selectedDay: number;
}) {
  const [values, setValues] = useState<Record<"Lunch" | "Dinner", number[]>>(() => ({
    Lunch: DAYS.map((d) => targets[`${position.id}:${d}:Lunch`] ?? 0),
    Dinner: DAYS.map((d) => targets[`${position.id}:${d}:Dinner`] ?? 0),
  }));

  function setDay(period: "Lunch" | "Dinner", dayIndex: number, next: number) {
    setValues((v) => ({
      ...v,
      [period]: v[period].map((x, i) => (i === dayIndex ? clamp(next) : x)),
    }));
  }

  function bumpRow(period: "Lunch" | "Dinner", delta: number) {
    setValues((v) => ({
      ...v,
      [period]: v[period].map((x) => clamp(x + delta)),
    }));
  }

  return (
    <>
      {(["Lunch", "Dinner"] as const).map((period, periodIndex) => (
        <tr key={period} className={"border-b" + (showCategoryBreak && periodIndex === 0 ? " border-t-2" : "")}>
          {periodIndex === 0 && (
            <td rowSpan={2} className="py-1.5 pr-2 align-top whitespace-nowrap border-r">
              <div className="font-medium">{position.name}</div>
              <div className="text-xs text-neutral-400">({position.category})</div>
            </td>
          )}
          <td className="py-1.5 pr-2 text-neutral-500 whitespace-nowrap align-top pt-2.5">{period}</td>
          <td className="py-1.5 pr-3 align-top pt-2">
            <MasterStepper onBump={(delta) => bumpRow(period, delta)} />
          </td>
          {DAYS.map((day, dayIndex) => (
            <td
              key={day}
              className={
                "py-1.5 text-center lg:table-cell " + (day === selectedDay ? "table-cell" : "hidden")
              }
            >
              <TargetStepper
                name={`target_${position.id}_${day}_${period}`}
                value={values[period][dayIndex]}
                onChange={(next) => setDay(period, dayIndex, next)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Bulk "All days" control for one row — bumps every day's count in that
 * row by 1 (or -1) relative to its current value, rather than resetting
 * every day to a single shared number, so existing day-to-day variation
 * survives a click. Deliberately chunkier/rounder than the per-day
 * stepper buttons (Oliver: "more like game ui") so it visually reads as
 * "the big button that affects everything" rather than just another
 * small stepper. */
function MasterStepper({ onBump }: { onBump: (delta: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1" title="Bump every day in this row by 1">
      <button
        type="button"
        onClick={() => onBump(-1)}
        className="size-11 lg:size-6 flex items-center justify-center rounded-full bg-neutral-200 text-neutral-700 text-sm font-bold hover:bg-neutral-300 active:scale-90 transition-transform"
        tabIndex={-1}
        aria-label="Decrease every day in this row by 1"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => onBump(1)}
        className="size-11 lg:size-6 flex items-center justify-center rounded-full bg-black text-white text-sm font-bold hover:bg-neutral-800 active:scale-90 transition-transform"
        tabIndex={-1}
        aria-label="Increase every day in this row by 1"
      >
        +
      </button>
    </div>
  );
}

/** [-] [count] [+] quantity stepper for one grid cell — controlled by the
 * parent (PositionTargetRows) now instead of owning its own state, so the
 * row's master stepper can update every cell in the row at once. Same
 * "game UI" quantity-picker presentation as before (2026-08-11); still
 * just a plain <input type="number" name="target_..."> under the hood.
 *
 * Sized by breakpoint since 2026-08-23: 44px on a phone (these measured
 * 20x24 in the visual audit, under WCAG 2.5.8's 24x24 floor, and there
 * are 364 of them on this page), back to the compact 20x24 at lg where
 * the pointer is a mouse and seven day-columns have to fit side by side.
 * The phone only shows one day at a time now, so the extra width costs
 * nothing there. */
function TargetStepper({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center border rounded overflow-hidden select-none">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="w-9 h-11 lg:w-5 lg:h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        disabled={value <= 0}
        tabIndex={-1}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        step={1}
        name={name}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-12 h-11 lg:w-7 lg:h-auto text-center border-x px-0 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-9 h-11 lg:w-5 lg:h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
        tabIndex={-1}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
