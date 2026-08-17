"use client";

import { useActionState, useState, useTransition } from "react";
import { generateLoginId, resetLoginId, type EmployeeActionState } from "@/lib/actions/employees";
import { guessLoginIdDepartment, type LoginIdDepartment } from "@/lib/employees/loginId";

const initialState: EmployeeActionState = { error: null };

const DEPARTMENT_LABEL: Record<LoginIdDepartment, string> = {
  PARTNER: "Partner",
  BOH: "BOH",
  FOH: "FOH",
};

/** Inline "Generate login ID" control on the People table (2026-08-17).
 * Pre-fills the department dropdown with a best guess (partner flag, else
 * position category) but always requires the manager to confirm/change it
 * before submitting — Oliver's explicit ask was a manual picker, not an
 * auto-derived value. Once generated, an ID is normally stable (see
 * generateLoginId's doc comment) — viewerIsAdmin unlocks a "Reset" escape
 * hatch (resetLoginId) for fixing a wrong department guess, e.g. from the
 * one-time backfill script. */
export function GenerateLoginIdControl({
  employeeId,
  loginId,
  isPartner,
  primaryPositionCategory,
  viewerIsAdmin = false,
}: {
  employeeId: number;
  loginId: string | null;
  isPartner: boolean;
  primaryPositionCategory: "FOH" | "BOH" | null;
  viewerIsAdmin?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(generateLoginId, initialState);
  const [open, setOpen] = useState(false);
  const [isResetting, startReset] = useTransition();
  const defaultDept = guessLoginIdDepartment({ isPartner, positionCategory: primaryPositionCategory });

  if (loginId) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-xs">{loginId}</span>
        {viewerIsAdmin && (
          <button
            type="button"
            disabled={isResetting}
            onClick={() => {
              if (confirm(`Reset ${loginId}? This person won't be able to log in with it until a new one is generated.`)) {
                startReset(() => resetLoginId(employeeId));
              }
            }}
            className="text-xs text-neutral-400 hover:underline disabled:opacity-50"
          >
            {isResetting ? "…" : "Reset"}
          </button>
        )}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="underline text-xs text-blue-600">
        Generate login ID
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="employeeId" value={employeeId} />
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      <select name="department" defaultValue={defaultDept} className="border rounded text-xs py-1 px-1.5">
        {(Object.keys(DEPARTMENT_LABEL) as LoginIdDepartment[]).map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABEL[d]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className="underline text-xs text-blue-600 disabled:opacity-50">
        {isPending ? "…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-400 hover:underline">
        Cancel
      </button>
    </form>
  );
}
