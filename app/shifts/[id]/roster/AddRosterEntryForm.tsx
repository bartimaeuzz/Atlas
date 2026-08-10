"use client";

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
 * against the roster already loaded on the page, no extra round trip. */
export function AddRosterEntryForm({
  shiftId,
  roster,
  allEmployees,
  allPositions,
}: {
  shiftId: number;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
}) {
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
        <select name="employeeId" required className="border rounded px-2 py-1 w-full">
          {allEmployees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.name}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-neutral-500 mb-1">Position</span>
        <select name="positionId" required className="border rounded px-2 py-1 w-full">
          {allPositions.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
          ))}
        </select>
      </label>
      <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800">
        Add
      </button>
    </form>
  );
}
