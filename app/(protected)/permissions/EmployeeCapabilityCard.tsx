"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { applyAccountTypePreset, saveEmployeeCapabilities, type PermissionActionState } from "@/lib/actions/permissions";
import {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_LABELS,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/permissions/capabilities";
import type { CapabilityMatrixEmployeeRow } from "@/lib/permissions/loadCapabilityMatrix";

const initialState: PermissionActionState = { error: null, saved: false };

/** ISO datetime or date string -> a plain YYYY-MM-DD for a native
 * <input type="date">'s defaultValue. Stored expiresAt values are ISO
 * date strings already (see setEmployeeCapabilities' formData handling),
 * but this stays defensive in case a full timestamp ever ends up here. */
function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function EmployeeCapabilityCard({ employee }: { employee: CapabilityMatrixEmployeeRow }) {
  const [presetState, presetAction, presetPending] = useActionState(applyAccountTypePreset, initialState);
  const [saveState, saveAction, savePending] = useActionState(saveEmployeeCapabilities, initialState);

  const manageIsGranted = employee.systemRole === "ADMIN";

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div>
          <span className="font-medium">{employee.nickname}</span>
          <span className="ml-2 text-xs text-[var(--ink-500)]">
            {employee.systemRole}
            {!employee.active && " · inactive"}
          </span>
        </div>

        <form action={presetAction} className="flex items-center gap-2">
          <input type="hidden" name="employeeId" value={employee.employeeId} />
          <label className="text-xs text-[var(--ink-500)]" htmlFor={`accountType-${employee.employeeId}`}>
            Account Type
          </label>
          <select
            id={`accountType-${employee.employeeId}`}
            name="accountType"
            defaultValue="STAFF"
            className="border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm px-2 py-1.5"
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" size="sm" loading={presetPending}>
            Apply preset
          </Button>
        </form>
      </div>

      {presetState.error && <p className="px-4 pt-2 text-xs text-[var(--danger)]">{presetState.error}</p>}
      {presetState.saved && !presetState.error && (
        <p className="px-4 pt-2 text-xs text-[var(--primary)]">Preset applied.</p>
      )}

      <details className="group">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm text-[var(--ink-500)] hover:bg-[var(--paper)]">
          Advanced: individual capabilities
        </summary>

        <form action={saveAction} className="px-4 pb-4">
          <input type="hidden" name="employeeId" value={employee.employeeId} />

          {CAPABILITY_CATEGORIES.map((category) => (
            <fieldset key={category} className="mt-4">
              <legend className="text-xs font-medium text-[var(--ink-500)] mb-2">{CAPABILITY_CATEGORY_LABELS[category]}</legend>
              <div className="space-y-2">
                {CAPABILITIES.filter((c) => c.category === category).map((def) => {
                  if (def.key === "MANAGE_PERMISSIONS") {
                    return (
                      <div key={def.key} className="flex items-center gap-2 text-sm text-[var(--ink-500)]">
                        <input type="checkbox" checked={manageIsGranted} disabled readOnly />
                        <span>{def.label} — tied to the Admin role, not individually grantable</span>
                      </div>
                    );
                  }
                  const current = employee.capabilities[def.key];
                  return (
                    <div key={def.key} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name={`cap_${def.key}`} defaultChecked={current.granted} />
                        <span title={def.description}>{def.label}</span>
                      </label>
                      {def.expirable && (
                        <label className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
                          expires
                          <input
                            type="date"
                            name={`exp_${def.key}`}
                            defaultValue={toDateInputValue(current.expiresAt)}
                            className="border border-[var(--border-strong)] rounded-[var(--radius-md)] px-1.5 py-1"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {saveState.error && <p className="mt-3 text-xs text-[var(--danger)]">{saveState.error}</p>}
          {saveState.saved && !saveState.error && <p className="mt-3 text-xs text-[var(--primary)]">Saved.</p>}

          <div className="mt-4">
            <Button type="submit" size="sm" loading={savePending}>
              Save changes
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
