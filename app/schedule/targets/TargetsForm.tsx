"use client";

import { useActionState, useState } from "react";
import { updateStaffingTargets, type ScheduleActionState } from "@/lib/actions/schedule";
import type { StaffingTargetPosition } from "@/lib/schedule/loadStaffingTargets";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const initialState: ScheduleActionState = { error: null };

/** One editable grid per period (Lunch/Dinner) — Position (rows, FOH then
 * BOH) x Day of week (columns). Each cell is a [-] [count] [+] stepper
 * (2026-08-11, Oliver: wanted a "game UI" quantity picker instead of a
 * plain number box) — purely a presentational swap, still just a plain
 * <input type="number" name="target_..."> under the hood so the same
 * full-grid submit + server-side validation is unchanged. Submits the
 * whole grid at once (every cell, even blanks) so the server can do a
 * full resync — see updateStaffingTargets's comment for why that's the
 * right call for this small table. */
export function TargetsForm({
  positions,
  targets,
}: {
  positions: StaffingTargetPosition[];
  targets: Record<string, number>;
}) {
  const [state, formAction, isPending] = useActionState(updateStaffingTargets, initialState);

  return (
    <form action={formAction} className="space-y-8">
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="border border-green-300 bg-green-50 text-green-700 rounded p-3 text-sm">Saved.</div>
      )}

      {(["Lunch", "Dinner"] as const).map((period) => (
        <section key={period}>
          <h2 className="text-lg font-medium mb-3">{period}</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1.5 pr-2">Position</th>
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
                const showCategoryBreak = p.category !== prevCategory;
                return (
                  <tr key={p.id} className={"border-b" + (showCategoryBreak && i > 0 ? " border-t-2" : "")}>
                    <td className="py-1.5 pr-2">
                      {p.name}
                      <span className="text-xs text-neutral-400 ml-1">({p.category})</span>
                    </td>
                    {DAYS.map((day) => (
                      <td key={day} className="py-1.5 text-center">
                        <TargetStepper
                          name={`target_${p.id}_${day}_${period}`}
                          initialValue={targets[`${p.id}:${day}:${period}`] ?? 0}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

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

/** [-] [count] [+] quantity stepper for one grid cell. Local state only
 * — the actual submitted value is the hidden number input's value
 * attribute, kept in sync on every +/- click or direct typing, so
 * nothing about the parent form's submit/resync logic needs to change. */
function TargetStepper({ name, initialValue }: { name: string; initialValue: number }) {
  const [value, setValue] = useState(initialValue);

  function clamp(n: number) {
    return Number.isNaN(n) ? 0 : Math.max(0, Math.round(n));
  }

  return (
    <div className="inline-flex items-center border rounded overflow-hidden select-none">
      <button
        type="button"
        onClick={() => setValue((v) => clamp(v - 1))}
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
        onChange={(e) => setValue(clamp(Number(e.target.value)))}
        className="w-7 text-center border-x px-0 py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => setValue((v) => clamp(v + 1))}
        className="w-5 h-6 flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
        tabIndex={-1}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
