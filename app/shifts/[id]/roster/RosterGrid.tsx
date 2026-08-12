"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRosterEntry, removeRosterEntry } from "@/lib/actions/shift";
import type { RosterPageEntry } from "@/lib/shift/loadRosterPageData";

/** Position-grid redesign of the roster page (2026-08-11, Oliver: wanted
 * it to read like the Schedule Planner's weekly grid — headcount target
 * per position, plus an inline dropdown to add someone as a last-minute
 * change right before the closing report). One position per row (this
 * page is always for one specific date+period, so there's no day-column
 * axis like the weekly grid has); each row shows who's assigned, the
 * target count, and a quick-add control.
 *
 * Carries over the two guards the old flat-list "Add someone" form had:
 * the multi-role confirm dialog (added 2026-08-10 after Oliver
 * accidentally double-added someone) and the assigned-vs-other position
 * grouping in the employee/position pickers — same reasoning, still
 * deliberately not blocking either, just confirming/labeling. */
export function RosterGrid({
  shiftId,
  positions,
  roster,
  targets,
  allEmployees,
  employeeAssignedPositionIds,
  readOnly,
}: {
  shiftId: number;
  positions: { id: number; name: string; category: "FOH" | "BOH" }[];
  roster: RosterPageEntry[];
  targets: Record<number, number>;
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  employeeAssignedPositionIds: Record<number, number[]>;
  readOnly: boolean;
}) {
  // employeeId -> total roster rows for them on this shift, across all
  // positions — powers the "N roles" badge, same as the old table.
  const roleCountByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of roster) map.set(r.employeeId, (map.get(r.employeeId) ?? 0) + 1);
    return map;
  }, [roster]);

  // positionId -> employees split into "usually works this role" vs "other"
  const employeesByPosition = useMemo(() => {
    const map = new Map<number, { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] }>();
    for (const p of positions) {
      const eligible: { id: number; name: string }[] = [];
      const other: { id: number; name: string }[] = [];
      for (const emp of allEmployees) {
        const assignedIds = employeeAssignedPositionIds[emp.id] ?? [];
        (assignedIds.includes(p.id) ? eligible : other).push(emp);
      }
      map.set(p.id, { eligible, other });
    }
    return map;
  }, [positions, allEmployees, employeeAssignedPositionIds]);

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-neutral-500 border-b">
          <th className="py-1.5 pr-2 w-40">Position</th>
          <th className="py-1.5">On the roster</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p, i) => {
          const prevCategory = i > 0 ? positions[i - 1].category : null;
          const showCategoryBreak = p.category !== prevCategory;
          const cellEntries = roster.filter((r) => r.positionId === p.id);
          const target = targets[p.id] ?? 0;
          const underTarget = target > 0 && cellEntries.length < target;

          return (
            <tr key={p.id} className={"border-b align-top" + (showCategoryBreak && i > 0 ? " border-t-2" : "")}>
              <td className="py-2 pr-2 whitespace-nowrap">
                {p.name}
                <span className="text-xs text-neutral-400 ml-1">({p.category})</span>
              </td>
              <td className={"py-2 px-1" + (underTarget ? " bg-red-50" : "")}>
                <div className="space-y-1">
                  {cellEntries.length === 0 && target === 0 && (
                    <span className="text-xs text-neutral-400">Nobody added yet.</span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {cellEntries.map((r) => {
                      const roleCount = roleCountByEmployee.get(r.employeeId) ?? 1;
                      return (
                        <RosterPill
                          key={r.rosterEntryId}
                          entry={r}
                          roleCount={roleCount}
                          shiftId={shiftId}
                          readOnly={readOnly}
                        />
                      );
                    })}
                  </div>
                  {target > 0 && (
                    <div className={"text-xs" + (underTarget ? " text-red-600 font-medium" : " text-neutral-400")}>
                      {cellEntries.length}/{target}
                    </div>
                  )}
                  {!readOnly && (
                    <RosterQuickAdd
                      shiftId={shiftId}
                      positionId={p.id}
                      employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                      alreadyAssignedIds={new Set(cellEntries.map((r) => r.employeeId))}
                      roster={roster}
                      allEmployees={allEmployees}
                    />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RosterPill({
  entry,
  roleCount,
  shiftId,
  readOnly,
}: {
  entry: RosterPageEntry;
  roleCount: number;
  shiftId: number;
  readOnly: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-neutral-100 text-neutral-700">
      <span>{entry.employeeName}</span>
      {roleCount > 1 && (
        <span
          className="bg-blue-100 text-blue-700 text-[10px] px-1 rounded"
          title="This person has multiple roles on this shift — paid on one combined paycheck."
        >
          {roleCount} roles
        </span>
      )}
      {!readOnly && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const formData = new FormData();
              formData.set("rosterEntryId", String(entry.rosterEntryId));
              formData.set("shiftId", String(shiftId));
              await removeRosterEntry(formData);
              router.refresh();
            })
          }
          className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}

function RosterQuickAdd({
  shiftId,
  positionId,
  employees,
  alreadyAssignedIds,
  roster,
  allEmployees,
}: {
  shiftId: number;
  positionId: number;
  employees: { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };
  alreadyAssignedIds: Set<number>;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  function handleAdd() {
    if (selectedId === "") return;

    const existingPositions = roster.filter((r) => r.employeeId === selectedId).map((r) => r.positionName);
    if (existingPositions.length > 0) {
      const employeeName = allEmployees.find((e) => e.id === selectedId)?.name ?? "This person";
      const confirmed = window.confirm(
        `${employeeName} is already rostered as ${existingPositions.join(", ")} this shift.\n\n` +
          `Add another role too? They'll be paid for all roles combined into one paycheck.`
      );
      if (!confirmed) return;
    }

    const formData = new FormData();
    formData.set("shiftId", String(shiftId));
    formData.set("employeeId", String(selectedId));
    formData.set("positionId", String(positionId));
    setError(null);
    startTransition(async () => {
      try {
        await addRosterEntry(formData);
        setSelectedId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedId}
        disabled={isPending}
        onChange={(e) => {
          setSelectedId(e.target.value === "" ? "" : Number(e.target.value));
          setError(null);
        }}
        className="text-xs border rounded px-1 py-0.5 max-w-[140px] text-neutral-500 disabled:opacity-50"
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
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="text-xs bg-black text-white rounded px-2 py-0.5 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      )}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
