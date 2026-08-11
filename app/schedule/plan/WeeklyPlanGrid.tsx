"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlannedAssignment, removePlannedAssignment } from "@/lib/actions/schedule";
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
 * of whether the slot happens to be under/at/over target.
 *
 * Double-booking warning (2026-08-11, Oliver-reported): a person can't
 * physically work two positions in the same date+period slot, but
 * nothing in the data model stops a manager from adding them to both
 * via the manual add form (e.g. someone shows up in both Bartender and
 * Busser for the same Monday Dinner). Rather than block it outright —
 * a manager might occasionally mean it — flag it with a small warning
 * badge (hover for detail) so it's visible at a glance instead of
 * silently wrong.
 *
 * Inline quick-add (2026-08-11, Oliver): every cell also gets a small
 * dropdown so a manager can add someone directly in the grid instead
 * of using the separate form below — same addPlannedAssignment action,
 * called directly (like GenerateWeekButton/PublishWeekButton do)
 * rather than through useActionState, since this needs to live inside
 * a table cell, not a <form>. Every cell gets it, not just under-target
 * ones — Oliver confirmed he wants to be able to add extra people even
 * to an already-fully-staffed cell. The "extra coverage" (yellow) flag
 * only appears next to the dropdown once a person is picked, and is a
 * manual checkbox, never auto-set — Oliver's call: the app shouldn't
 * guess whether an add is "covering a known gap" vs "anticipating a
 * busy day," those mean different things to him. */
export function WeeklyPlanGrid({
  data,
  weekId,
  allEmployees,
  employeeAssignedPositionIds,
}: {
  data: WeeklyPlanData;
  weekId: number;
  allEmployees: { id: number; name: string }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const positionNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of data.positions) map.set(p.id, p.name);
    return map;
  }, [data.positions]);

  // "employeeId:date:period" -> every positionId that employee is on for that slot
  const slotPositionsByEmployee = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const a of data.assignments) {
      const key = `${a.employeeId}:${a.date}:${a.period}`;
      const existing = map.get(key);
      if (existing) existing.push(a.positionId);
      else map.set(key, [a.positionId]);
    }
    return map;
  }, [data.assignments]);

  // positionId -> employees split into "usually works this role" vs "other"
  const employeesByPosition = useMemo(() => {
    const map = new Map<number, { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] }>();
    for (const p of data.positions) {
      const eligible: { id: number; name: string }[] = [];
      const other: { id: number; name: string }[] = [];
      for (const emp of allEmployees) {
        const assignedIds = employeeAssignedPositionIds[emp.id] ?? [];
        (assignedIds.includes(p.id) ? eligible : other).push(emp);
      }
      map.set(p.id, { eligible, other });
    }
    return map;
  }, [data.positions, allEmployees, employeeAssignedPositionIds]);

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
                            {cellAssignments.map((a) => {
                              const slotKey = `${a.employeeId}:${date}:${period}`;
                              const otherPositionIds = (slotPositionsByEmployee.get(slotKey) ?? []).filter(
                                (id) => id !== a.positionId
                              );
                              const conflictPositionNames = [...new Set(otherPositionIds)].map(
                                (id) => positionNameById.get(id) ?? "?"
                              );
                              return (
                                <AssignmentPill
                                  key={a.id}
                                  assignment={a}
                                  conflictPositionNames={conflictPositionNames}
                                />
                              );
                            })}
                            {target > 0 && (
                              <div className={"text-xs" + (underTarget ? " text-red-600 font-medium" : " text-neutral-400")}>
                                {cellAssignments.length}/{target}
                              </div>
                            )}
                            <QuickAddCell
                              weekId={weekId}
                              date={date}
                              period={period}
                              positionId={p.id}
                              employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                              alreadyAssignedIds={new Set(cellAssignments.map((a) => a.employeeId))}
                            />
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

function AssignmentPill({
  assignment,
  conflictPositionNames,
}: {
  assignment: PlannedAssignmentRow;
  conflictPositionNames: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const hasConflict = conflictPositionNames.length > 0;

  return (
    <div
      className={
        "flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-xs " +
        (assignment.isExtraCoverage ? "bg-yellow-100 text-yellow-900" : "bg-neutral-100 text-neutral-700")
      }
    >
      <span className="flex items-center gap-1">
        {assignment.employeeName}
        {hasConflict && (
          <span
            title={`Also scheduled as ${conflictPositionNames.join(", ")} in this same slot — double check this is intentional.`}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none cursor-help shrink-0"
          >
            !
          </span>
        )}
      </span>
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

/** Inline "add someone to this exact slot" control — a compact
 * dropdown (grouped: people who usually work this position, then
 * everyone else) plus an "extra coverage" checkbox that only appears
 * once a name is picked. Selecting a name does NOT auto-submit — you
 * need the "+" button, so there's a chance to check the extra-coverage
 * box first if this add is meant to be the yellow/busy-day case. */
function QuickAddCell({
  weekId,
  date,
  period,
  positionId,
  employees,
  alreadyAssignedIds,
}: {
  weekId: number;
  date: string;
  period: "Lunch" | "Dinner";
  positionId: number;
  employees: { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };
  alreadyAssignedIds: Set<number>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [isExtraCoverage, setIsExtraCoverage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  function handleAdd() {
    if (selectedId === "") return;
    const formData = new FormData();
    formData.set("weekId", String(weekId));
    formData.set("employeeId", String(selectedId));
    formData.set("positionId", String(positionId));
    formData.set("date", date);
    formData.set("period", period);
    if (isExtraCoverage) formData.set("isExtraCoverage", "on");
    setError(null);
    startTransition(async () => {
      const result = await addPlannedAssignment({ error: null }, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedId("");
      setIsExtraCoverage(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1">
        <select
          value={selectedId}
          disabled={isPending}
          onChange={(e) => {
            setSelectedId(e.target.value === "" ? "" : Number(e.target.value));
            setError(null);
          }}
          className="text-[10px] border rounded px-0.5 py-0.5 max-w-[76px] text-neutral-500 disabled:opacity-50"
        >
          <option value="">+ Add</option>
          {eligible.length > 0 && (
            <optgroup label="Usually this role">
              {eligible.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          )}
          {other.length > 0 && (
            <optgroup label="Other">
              {other.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        {selectedId !== "" && (
          <>
            <label
              className="flex items-center gap-0.5 text-[9px] text-neutral-400 cursor-pointer"
              title="Extra coverage — an anticipated busy day, not filling a known gap"
            >
              <input
                type="checkbox"
                checked={isExtraCoverage}
                onChange={(e) => setIsExtraCoverage(e.target.checked)}
                className="w-2.5 h-2.5"
              />
              extra
            </label>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="text-[10px] bg-black text-white rounded px-1 leading-tight disabled:opacity-50"
            >
              +
            </button>
          </>
        )}
      </div>
      {error && <div className="text-[9px] text-red-600 mt-0.5">{error}</div>}
    </div>
  );
}
