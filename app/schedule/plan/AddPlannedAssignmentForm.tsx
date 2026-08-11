"use client";

import { useActionState, useMemo, useState } from "react";
import { addPlannedAssignment, type PlannedAssignmentActionState } from "@/lib/actions/schedule";

const initialState: PlannedAssignmentActionState = { error: null };

/** Manual add form for a specific slot in the weekly plan — same
 * employee-picks-defaults-position UX as the roster and template forms.
 * The "Extra coverage" checkbox is the YELLOW flag — confirmed standalone
 * with Oliver, independent of any red vacancy: a manager marking a day
 * as needing extra headcount beyond the template (expected busy day,
 * known advance-booked event). */
export function AddPlannedAssignmentForm({
  weekId,
  dates,
  allEmployees,
  allPositions,
  employeeAssignedPositionIds,
}: {
  weekId: number;
  dates: string[];
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const [state, formAction, isPending] = useActionState(addPlannedAssignment, initialState);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">(allEmployees[0]?.id ?? "");

  const assignedIds = useMemo(() => {
    if (selectedEmployeeId === "") return new Set<number>();
    return new Set(employeeAssignedPositionIds[selectedEmployeeId] ?? []);
  }, [selectedEmployeeId, employeeAssignedPositionIds]);

  const assignedPositions = allPositions.filter((p) => assignedIds.has(p.id));
  const otherPositions = allPositions.filter((p) => !assignedIds.has(p.id));
  const hasAnyAssignment = assignedPositions.length > 0;

  const selectedEmployee = allEmployees.find((e) => e.id === selectedEmployeeId);
  const defaultPositionId =
    (selectedEmployee?.primaryPositionId != null && assignedIds.has(selectedEmployee.primaryPositionId)
      ? selectedEmployee.primaryPositionId
      : null) ??
    assignedPositions[0]?.id ??
    allPositions[0]?.id ??
    "";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="weekId" value={weekId} />
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">{state.error}</div>
      )}
      <div className="grid sm:grid-cols-6 gap-3 items-end">
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Employee</span>
          <select
            name="employeeId"
            required
            className="border rounded px-2 py-1 w-full"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
          >
            {allEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Position</span>
          <select
            key={selectedEmployeeId}
            name="positionId"
            required
            defaultValue={defaultPositionId}
            className="border rounded px-2 py-1 w-full"
          >
            {hasAnyAssignment ? (
              <>
                <optgroup label="Assigned to this person">
                  {assignedPositions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                  ))}
                </optgroup>
                <optgroup label="Other positions">
                  {otherPositions.map((p) => (
                    <option key={p.id} value={p.id} style={{ color: "#9ca3af" }}>{p.name} ({p.category})</option>
                  ))}
                </optgroup>
              </>
            ) : (
              allPositions.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
              ))
            )}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Date</span>
          <select name="date" required defaultValue={dates[0]} className="border rounded px-2 py-1 w-full">
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Period</span>
          <select name="period" required defaultValue="Dinner" className="border rounded px-2 py-1 w-full">
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="isExtraCoverage" />
          <span className="text-neutral-500">Extra coverage</span>
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
