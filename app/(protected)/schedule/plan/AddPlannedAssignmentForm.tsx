"use client";

import { useActionState, useMemo, useState } from "react";
import { addPlannedAssignment, type PlannedAssignmentActionState } from "@/lib/actions/schedule";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: PlannedAssignmentActionState = { error: null };

/** Manual add form for a specific slot in the weekly plan — same
 * employee-picks-defaults-position UX as the roster and template forms.
 * The "Extra coverage" checkbox is the YELLOW flag — confirmed standalone
 * with Oliver, independent of any red vacancy: a manager marking a day
 * as needing extra headcount beyond the template (expected busy day,
 * known advance-booked event). Restyled onto the design system 2026-08-18
 * -- selects now use the shared `Select` component instead of one-off
 * borders, per the already-standing rule against inconsistent `<select>`
 * styling (2026-08-16 verification pass). */
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
      {state.error && <Banner tone="danger" title="Couldn't add" description={state.error} />}
      <div className="grid sm:grid-cols-6 gap-3 items-end">
        <Select
          label="Employee"
          name="employeeId"
          required
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
        >
          {allEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </Select>
        <Select
          label="Position"
          key={selectedEmployeeId}
          name="positionId"
          required
          defaultValue={defaultPositionId}
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
                  <option key={p.id} value={p.id} style={{ color: "var(--ink-500)" }}>{p.name} ({p.category})</option>
                ))}
              </optgroup>
            </>
          ) : (
            allPositions.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))
          )}
        </Select>
        <Select label="Date" name="date" required defaultValue={dates[0]}>
          {dates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
        <Select label="Period" name="period" required defaultValue="Dinner">
          <option value="Lunch">Lunch</option>
          <option value="Dinner">Dinner</option>
        </Select>
        <label className="text-sm flex items-center gap-2 pb-3">
          <input type="checkbox" name="isExtraCoverage" className="w-4 h-4" />
          <span className="text-[var(--ink-500)]">Extra coverage</span>
        </label>
        <Button type="submit" loading={isPending}>
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
