"use client";

import { useMemo, useState } from "react";
import { addRosterEntry } from "@/lib/actions/shift";
import type { RosterPageEntry } from "@/lib/shift/loadRosterPageData";

/** Confirms before adding someone who's already staffed on this shift in a
 * different position — added 2026-08-10 after Oliver stress-tested the
 * roster (added Aey as both Bartender and Sous Chef with no warning). The
 * payout math already handles multi-role correctly (tip shares sum across
 * all pool-eligible rows, wage auto-resolves with an override available —
 * see the wage-adjustments feature), so this is deliberately just a
 * fat-finger guard, not a policy that blocks or restricts multi-role
 * staffing — other restaurants may genuinely use it. Client-side check
 * against the roster already loaded on the page, no extra round trip.
 *
 * Also (2026-08-10, same round): the Position dropdown now groups
 * positions by whether the selected employee is actually assigned to them
 * in Employee admin — assigned positions listed first and normal, other
 * positions grouped separately and greyed out. Still fully selectable,
 * not blocked — same flexibility reasoning as the confirm dialog above,
 * a restaurant may genuinely need someone to cover a position they're not
 * formally set up for.
 *
 * Also (2026-08-10, later round — Oliver's ask: "point at the primary
 * position so I don't need to select every time"): picking an employee
 * now defaults the Position dropdown to their `primaryPositionId`
 * (falling back to the first assigned/first-overall position if they have
 * no primary position set or it's since been retired). Implemented via
 * `key={selectedEmployeeId}` forcing the <select> to remount with a fresh
 * `defaultValue` each time the employee changes — simpler than fighting a
 * fully-controlled select, and the manager can still freely change it
 * afterward like any normal dropdown. */
export function AddRosterEntryForm({
  shiftId,
  roster,
  allEmployees,
  allPositions,
  employeeAssignedPositionIds,
}: {
  shiftId: number;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "">(allEmployees[0]?.id ?? "");

  const assignedIds = useMemo(() => {
    if (selectedEmployeeId === "") return new Set<number>();
    return new Set(employeeAssignedPositionIds[selectedEmployeeId] ?? []);
  }, [selectedEmployeeId, employeeAssignedPositionIds]);

  const assignedPositions = allPositions.filter((p) => assignedIds.has(p.id));
  const otherPositions = allPositions.filter((p) => !assignedIds.has(p.id));
  // If the employee has no assignments at all (brand new, or never set up
  // in Employee admin), don't grey out everything — just show the full
  // flat list like before, nothing to compare against yet.
  const hasAnyAssignment = assignedPositions.length > 0;

  // Default Position selection: their primary position if it's active and
  // in the list, else their first assigned position, else just whatever's
  // first overall — always SOME sane default, never leaving it on a stale
  // selection from the previously-picked employee.
  const selectedEmployee = allEmployees.find((e) => e.id === selectedEmployeeId);
  const defaultPositionId =
    (selectedEmployee?.primaryPositionId != null && assignedIds.has(selectedEmployee.primaryPositionId)
      ? selectedEmployee.primaryPositionId
      : null) ??
    assignedPositions[0]?.id ??
    allPositions[0]?.id ??
    "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const employeeId = Number(new FormData(form).get("employeeId"));
    const existingPositions = roster.filter((r) => r.employeeId === employeeId).map((r) => r.positionName);

    if (existingPositions.length > 0) {
      const employeeName = allEmployees.find((emp) => emp.id === employeeId)?.name ?? "This person";
      const confirmed = window.confirm(
        `${employeeName} is already rostered as ${existingPositions.join(", ")} this shift.\n\n` +
          `Add another role too? They'll be paid for all roles combined into one paycheck.`
      );
      if (!confirmed) {
        e.preventDefault();
      }
    }
  }

  return (
    <form action={addRosterEntry} onSubmit={handleSubmit} className="grid sm:grid-cols-3 gap-3 items-end">
      <input type="hidden" name="shiftId" value={shiftId} />
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
      <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800">
        Add
      </button>
    </form>
  );
}
