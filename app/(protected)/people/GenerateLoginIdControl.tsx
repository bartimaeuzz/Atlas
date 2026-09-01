"use client";

import { useActionState, useState, useTransition } from "react";
import { generateLoginId, resetLoginId, type EmployeeActionState } from "@/lib/actions/employees";
import { guessLoginIdDepartment, type LoginIdDepartment } from "@/lib/employees/loginId";
import { Select } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

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
 * one-time backfill script.
 *
 * Restyled onto design-system-v2 2026-08-19 -- also replaces the admin
 * "Reset" button's raw window.confirm() with the shared ConfirmDialog
 * (reversible tier), per Atlas's standing rule that a retrofit migrates
 * any window.confirm() it touches. */
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
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  const [open, setOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, startReset] = useTransition();
  const defaultDept = guessLoginIdDepartment({ isPartner, positionCategory: primaryPositionCategory });

  if (loginId) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-xs text-[var(--ink-900)]">{loginId}</span>
        {viewerIsAdmin && (
          <>
            <button
              type="button"
              disabled={isResetting}
              onClick={() => setConfirmingReset(true)}
              className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
            >
              {isResetting ? "…" : "Reset"}
            </button>
            <ConfirmDialog
              open={confirmingReset}
              onClose={() => setConfirmingReset(false)}
              onConfirm={() => {
                setConfirmingReset(false);
                startReset(() => resetLoginId(employeeId));
              }}
              title={`Reset ${loginId}?`}
              description="This person won't be able to log in with it until a new one is generated."
              confirmLabel="Reset login ID"
              loading={isResetting}
            />
          </>
        )}
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`underline text-xs text-[var(--primary)] ${TAP_TARGET_PAD}`}>
        Generate login ID
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="employeeId" value={employeeId} />
      {state.error && <span className="text-xs text-[var(--danger)]">{state.error}</span>}
      <div className="w-28">
        <Select name="department" defaultValue={defaultDept} aria-label="Login ID department">
          {(Object.keys(DEPARTMENT_LABEL) as LoginIdDepartment[]).map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABEL[d]}
            </option>
          ))}
        </Select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className={`underline text-xs text-[var(--primary)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
      >
        {isPending ? "…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={`text-xs text-[var(--ink-500)] hover:underline ${TAP_TARGET_PAD}`}>
        Cancel
      </button>
    </form>
  );
}
