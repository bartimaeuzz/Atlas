"use client";

import { useActionState } from "react";
import { updateStaffingTargets, type ScheduleActionState } from "@/lib/actions/schedule";
import type { StaffingTargetPosition } from "@/lib/schedule/loadStaffingTargets";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const initialState: ScheduleActionState = { error: null };

/** One editable grid per period (Lunch/Dinner) — Position (rows, FOH then
 * BOH) x Day of week (columns). Plain number inputs, no client-side
 * validation beyond the browser's min=0 — the server action re-validates
 * anyway, same "don't trust the client" convention as every other form
 * in this app. Submits the whole grid at once (every cell, even blanks)
 * so the server can do a full resync — see updateStaffingTargets's
 * comment for why that's the right call for this small table. */
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
                        <input
                          type="number"
                          min={0}
                          step={1}
                          name={`target_${p.id}_${day}_${period}`}
                          defaultValue={targets[`${p.id}:${day}:${period}`] ?? ""}
                          className="border rounded w-12 text-center px-1 py-0.5"
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
