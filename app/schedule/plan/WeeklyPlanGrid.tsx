"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removePlannedAssignment } from "@/lib/actions/schedule";
import type { WeeklyPlanData, PlannedAssignmentRow } from "@/lib/schedule/loadWeeklyPlan";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayOfWeekFor(dateIso: string): number {
  // Pinned to UTC noon, same convention as lib/schedule/weekMath.ts.
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Position × Date grid, one per period (Lunch/Dinner) — mirrors the
 * Staffing Targets grid's shape so the two pages feel like the same
 * tool. A cell's border turns red when it has fewer people than the
 * staffing target for that position/day/period — the "at a glance see
 * what's short" behavior Oliver asked for. Extra-coverage assignments
 * (YELLOW) get a highlighted background on their own name, independent
 * of whether the slot happens to be under/at/over target. */
export function WeeklyPlanGrid({ data }: { data: WeeklyPlanData }) {
  return (
    <div className="space-y-8">
      {(["Lunch", "Dinner"] as const).map((period) => (
        <section key={period}>
          <h2 className="text-lg font-medium mb-3">{period}</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1.5 pr-2">Position</th>
                {data.dates.map((d) => (
                  <th key={d} className="py-1.5 text-left align-bottom">
                    <div>{DAY_LABELS[dayOfWeekFor(d)]}</div>
                    <div className="text-xs font-normal text-neutral-400">{d.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p, i) => {
                const prevCategory = i > 0 ? data.positions[i - 1].category : null;
                const showCategoryBreak = p.category !== prevCategory;
                return (
                  <tr key={p.id} className={"border-b align-top" + (showCategoryBreak && i > 0 ? " border-t-2" : "")}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {p.name}
                      <span className="text-xs text-neutral-400 ml-1">({p.category})</span>
                    </td>
                    {data.dates.map((date) => {
                      const dayOfWeek = dayOfWeekFor(date);
                      const target = data.targets[`${p.id}:${dayOfWeek}:${period}`] ?? 0;
                      const cellAssignments = data.assignments.filter(
                        (a) => a.positionId === p.id && a.date === date && a.period === period
                      );
                      const underTarget = target > 0 && cellAssignments.length < target;
                      return (
                        <td key={date} className={"py-1.5 px-1 align-top" + (underTarget ? " bg-red-50" : "")}>
                          <div className="space-y-0.5">
                            {cellAssignments.map((a) => (
                              <AssignmentPill key={a.id} assignment={a} />
                            ))}
                            {target > 0 && (
                              <div className={"text-xs" + (underTarget ? " text-red-600 font-medium" : " text-neutral-400")}>
                                {cellAssignments.length}/{target}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function AssignmentPill({ assignment }: { assignment: PlannedAssignmentRow }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div
      className={
        "flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-xs " +
        (assignment.isExtraCoverage ? "bg-yellow-100 text-yellow-900" : "bg-neutral-100 text-neutral-700")
      }
    >
      <span>{assignment.employeeName}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await removePlannedAssignment(assignment.id);
            router.refresh();
          })
        }
        className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}
