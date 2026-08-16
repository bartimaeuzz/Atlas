"use client";

import { useActionState, useState } from "react";
import { createEmployee, updateEmployee, type EmployeeActionState } from "@/lib/actions/employees";
import type { EmployeeListRow, AssignablePosition } from "@/lib/employees/loadEmployeesList";

const initialState: EmployeeActionState = { error: null };

export function EmployeeForm({
  existing,
  allPositions,
}: {
  existing: EmployeeListRow | null;
  allPositions: AssignablePosition[];
}) {
  const action = existing ? updateEmployee : createEmployee;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialAssigned = new Set(existing?.positions.map((p) => p.positionId) ?? []);
  const [assigned, setAssigned] = useState<Set<number>>(initialAssigned);

  const tipPointFor = (positionId: number) => existing?.positions.find((p) => p.positionId === positionId)?.tipPointValue;
  const wageRateFor = (positionId: number, period: "Lunch" | "Dinner") =>
    existing?.wageRates.find((r) => r.positionId === positionId && r.period === period)?.rate;

  const toggleAssigned = (positionId: number, checked: boolean) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (checked) next.add(positionId);
      else next.delete(positionId);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {existing && <input type="hidden" name="employeeId" value={existing.id} />}

      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          name="name"
          defaultValue={existing?.name}
          required
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Hire date</label>
          <input
            type="date"
            name="hireDate"
            defaultValue={existing?.hireDate ?? ""}
            className="border rounded px-3 py-2 text-sm w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">System role</label>
          <select
            name="systemRole"
            defaultValue={existing?.systemRole ?? "STAFF"}
            className="border rounded px-3 py-2 text-sm w-full"
          >
            <option value="STAFF">STAFF — restricted roster view</option>
            <option value="MANAGER">MANAGER — sees everything</option>
            <option value="ADMIN">ADMIN — sees everything</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Primary position</label>
        <select
          name="primaryPositionId"
          defaultValue={existing?.primaryPositionId ?? ""}
          className="border rounded px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">— none —</option>
          {allPositions
            .filter((p) => assigned.has(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
        </select>
        <p className="text-xs text-neutral-500 mt-1">
          Must be one of the positions checked below. This is the row that carries this person&apos;s wage
          on a shift when they&apos;re staffed in more than one position.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={existing?.active ?? true} />
        Active — unchecking retires them (never deleted; past shifts stay intact)
      </label>

      <label className="flex items-start gap-2 text-sm border rounded p-3 bg-neutral-50">
        <input
          type="checkbox"
          name="isFinancialAuditor"
          defaultChecked={existing?.isFinancialAuditor ?? false}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium">Financial auditor</span>
          <span className="block text-xs text-neutral-500 mt-0.5">
            Can edit a Supplier Check invoice that&apos;s already Printed or Paid. Their own PIN below
            doubles as the confirmation code required on every such edit — anyone doing that edit,
            even an Admin, has to enter THIS person&apos;s code to confirm it, not their own.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="text-lg font-medium mb-2">Positions</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Which positions this person can be rostered into, and their standing tip point value for FOH
          positions (e.g. Server @ 1.0, Bartender @ 0.8 — a closing-time bump on a specific shift is
          entered on that shift&apos;s Closing Report, not here). For BOH positions, set their wage rate
          directly below — this is per-employee since BOH wages aren&apos;t shared like FOH&apos;s
          position-wide rate (set on the Positions page).
        </p>
        <div className="space-y-3">
          {allPositions.map((p) => (
            <div key={p.id} className="border rounded p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name={`assign_${p.id}`}
                  checked={assigned.has(p.id)}
                  onChange={(e) => toggleAssigned(p.id, e.target.checked)}
                />
                {p.name} <span className="text-neutral-400 font-normal">({p.category})</span>
                {!p.active && <span className="text-xs text-neutral-400 font-normal">(retired)</span>}
              </label>

              {assigned.has(p.id) && (
                <div className="mt-2 ml-6 flex flex-wrap gap-4 items-end">
                  <label className="text-xs">
                    <span className="block text-neutral-500 mb-1">Standing tip point value</span>
                    <input
                      type="number"
                      step="0.1"
                      name={`tipPoint_${p.id}`}
                      defaultValue={tipPointFor(p.id) ?? p.defaultTipPointValue ?? 1.0}
                      className="border rounded px-2 py-1 text-sm w-24"
                    />
                  </label>
                  {p.category === "BOH" && (
                    <>
                      <label className="text-xs">
                        <span className="block text-neutral-500 mb-1">Lunch wage</span>
                        <input
                          type="number"
                          step="0.01"
                          name={`wageRate_${p.id}_Lunch`}
                          defaultValue={wageRateFor(p.id, "Lunch") ?? ""}
                          placeholder="0.00"
                          className="border rounded px-2 py-1 text-sm w-24"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="block text-neutral-500 mb-1">Dinner wage</span>
                        <input
                          type="number"
                          step="0.01"
                          name={`wageRate_${p.id}_Dinner`}
                          defaultValue={wageRateFor(p.id, "Dinner") ?? ""}
                          placeholder="0.00"
                          className="border rounded px-2 py-1 text-sm w-24"
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : existing ? "Save changes" : "Create employee"}
      </button>
    </form>
  );
}
