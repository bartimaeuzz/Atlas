"use client";

import { useActionState, useMemo, useState } from "react";
import { createTemplateAssignment, type TemplateActionState } from "@/lib/actions/schedule";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const initialState: TemplateActionState = { error: null };

/** Add-assignment form for the recurring schedule template — same
 * employee-picks-defaults-position UX as
 * app/shifts/[id]/roster/AddRosterEntryForm.tsx (assigned positions
 * grouped first, others greyed out but still selectable), reused here
 * rather than reinvented since the underlying question ("which position
 * does this employee actually do?") is identical. */
export function AddTemplateForm({
  allEmployees,
  allPositions,
  employeeAssignedPositionIds,
}: {
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const [state, formAction, isPending] = useActionState(createTemplateAssignment, initialState);
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
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">{state.error}</div>
      )}
      <div className="grid sm:grid-cols-5 gap-3 items-end">
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
          <span className="block text-neutral-500 mb-1">Day</span>
          <select name="dayOfWeek" required defaultValue={1} className="border rounded px-2 py-1 w-full">
            {DAYS.map((d) => (
              <option key={d} value={d}>{DAY_LABELS[d]}</option>
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
        <label className="text-sm">
          <span className="block text-neutral-500 mb-1">Effective from (optional)</span>
          <input type="date" name="effectiveFrom" className="border rounded px-2 py-1 w-full" />
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
