"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { ExpiryField } from "./ExpiryField";
import { saveEmployeeCapabilities, type PermissionActionState } from "@/lib/actions/permissions";
import {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  CAPABILITY_CATEGORY_LABELS,
} from "@/lib/permissions/capabilities";
import { PresetApplyForm } from "./PresetApplyForm";
import type { CapabilityMatrixEmployeeRow } from "@/lib/permissions/loadCapabilityMatrix";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: PermissionActionState = { error: null, saved: false };

/** ISO datetime or date string -> a plain YYYY-MM-DD for a native
 * <input type="date">'s defaultValue. Stored expiresAt values are ISO
 * date strings already (see setEmployeeCapabilities' formData handling),
 * but this stays defensive in case a full timestamp ever ends up here. */
function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function EmployeeCapabilityCard({
  employee,
  showHeader = true,
}: {
  employee: CapabilityMatrixEmployeeRow;
  /** False when rendered inside a role card, where the row above already
   * names the person and repeating it just pushes the controls down
   * (2026-08-23). The preset form still renders either way -- it is the
   * everyday control, not decoration. */
  showHeader?: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveEmployeeCapabilities, initialState);
  const formRef = useKeepValuesOnError(savePending, !!saveState.error);

  // Remount the form whenever the STORED grants change (2026-09-01, Oliver:
  // "after hitting permission level reset, the checkboxes weren't marked
  // until refreshed").
  //
  // Root cause, measured rather than guessed: applying a preset writes to the
  // database and revalidates correctly, and React does re-render this card
  // with the new data — the checkbox's `checked` ATTRIBUTE flips to true. But
  // `defaultChecked` is only a default. Once an input is mounted the browser's
  // live `checked` PROPERTY is independent of the attribute, and nothing
  // React does afterwards moves it. So the row said "off" while the database
  // said "on", and only a full page load (a remount) agreed with the
  // database. On a permissions screen that is the worst possible lie: it
  // tells an admin they have not granted something they just granted.
  //
  // The signature covers expiry dates too — ExpiryField is a `defaultValue`
  // input with exactly the same problem. When nothing stored has changed the
  // signature is stable, so an admin's un-saved ticking is never wiped out
  // from under them; it only remounts when the server's answer actually
  // moved. Same fix as ClosingReportForm's save-nonce key.
  const storedSignature = CAPABILITIES.map((def) => {
    const c = employee.capabilities[def.key];
    return `${def.key}:${c?.granted ? 1 : 0}:${c?.expiresAt ?? ""}`;
  }).join("|");

  const manageIsGranted = employee.systemRole === "ADMIN";

  return (
    <div className={showHeader ? "rounded-[var(--radius-md)] border border-[var(--border)] bg-white overflow-hidden" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        {showHeader ? (
          <div>
            <span className="font-medium">{employee.nickname}</span>
            <span className="ml-2 text-xs text-[var(--ink-500)]">
              {employee.systemRole}
              {!employee.active && " · inactive"}
            </span>
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-500)] self-center">Reset this account to a preset</span>
        )}

        <PresetApplyForm employee={employee} />
      </div>

      <details className="group">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm text-[var(--ink-500)] hover:bg-[var(--hover)]">
          Advanced: individual capabilities
        </summary>

        <form key={storedSignature} ref={formRef} action={saveAction} className="px-4 pb-4">
          <input type="hidden" name="employeeId" value={employee.employeeId} />

          {CAPABILITY_CATEGORIES.map((category) => (
            <fieldset key={category} className="mt-4">
              <legend className="text-xs font-medium text-[var(--ink-500)] mb-2">{CAPABILITY_CATEGORY_LABELS[category]}</legend>
              <div className="space-y-2">
                {CAPABILITIES.filter((c) => c.category === category).map((def) => {
                  if (def.key === "MANAGE_PERMISSIONS") {
                    return (
                      <div key={def.key} className="text-[var(--ink-500)]">
                        <Checkbox
                          checked={manageIsGranted}
                          disabled
                          readOnly
                          label={`${def.label} — tied to the Admin role, not individually grantable`}
                        />
                      </div>
                    );
                  }
                  const current = employee.capabilities[def.key];
                  return (
                    <div key={def.key} className="flex flex-wrap items-center gap-2 text-sm">
                      {/* The design system's Checkbox, not a bare <input>
                          (2026-08-23 visual audit): the raw control measured
                          13x13 CSS px with a 20px-tall label around it, under
                          WCAG 2.5.8's 24x24 floor, on a page where a mis-tap
                          silently grants or revokes someone's access. Choice
                          puts min-h-11 on the label, which is what actually
                          gets hit-tested. Deliberately NOT TAP_TARGET_PAD --
                          see Field.tsx's comment for why that fails here. */}
                      <Checkbox
                        name={`cap_${def.key}`}
                        defaultChecked={current.granted}
                        label={<span title={def.description}>{def.label}</span>}
                      />
                      {/* A key nothing checks yet (2026-08-23). The switch
                          stays live so the grant is recorded for the day the
                          feature lands, but saying nothing would let an Admin
                          believe they had restricted something they had not. */}
                      {def.notYetEnforced && (
                        <span className="text-xs text-[var(--ink-700)] bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-full)] px-2 py-0.5">
                          Not in effect yet — nothing checks this
                        </span>
                      )}
                      {def.expirable && (
                        <div className="w-full">
                          <ExpiryField name={`exp_${def.key}`} defaultValue={toDateInputValue(current.expiresAt)} />
                        </div>
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
