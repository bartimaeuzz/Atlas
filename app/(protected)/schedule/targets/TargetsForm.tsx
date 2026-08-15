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

      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[820px] text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-1.5 pr-2 border-r">Position</th>
              <th className="py-1.5 pr-2">Period</th>
              <th className="py-1.5 pr-3 whitespace-nowrap">All days</th>
              {DAY_LABELS.map((label) => (
                <th key={label} className="py-1.5 text-center w-14">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const prevCategory = i > 0 ? positions[i - 1].category : null;
              const showCategoryBreak = i > 0 && p.category !== prevCategory;
              return (
                <PositionTargetRows key={p.id} position={p} targets={targets} showCategoryBreak={showCategoryBreak} />
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
  showCategoryBreak,
}: {
  position: StaffingTargetPosition;
  targets: Record<string, number>;
  showCategoryBreak: boolean;
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
            <td key={day} className="py-1.5 text-center">
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
        className="w-6 h-6 flex items-center justify-center rounded-full bg-neutral-200 text-neutral-700 text-sm font-bold hover:bg-neutral-300 active:scale-90 transition-transform"
        tabIndex={-1}
        aria-label="Decrease every day in this row by 1"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => onBump(1)}
        className="w-6 h-6 flex items-center justify-center rounded-full bg-black text-white text-sm font-bold hover:bg-neutral-800 active:scale-90 transition-transform"
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
 * just a plain <input type="number" name="target_..."> under the hood. */
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
        className="w-5 h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
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
        className="w-7 text-center border-x px-0 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-5 h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
        tabIndex={-1}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
