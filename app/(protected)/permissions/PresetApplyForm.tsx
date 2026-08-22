"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { applyAccountTypePreset, type PermissionActionState } from "@/lib/actions/permissions";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/permissions/capabilities";
import { computePresetDiff, presetDiffIsEmpty } from "@/lib/permissions/presetDiff";
import type { CapabilityMatrixEmployeeRow } from "@/lib/permissions/loadCapabilityMatrix";

const initialState: PermissionActionState = { error: null, saved: false };

/**
 * Account Type preset control (rewritten 2026-08-22 after a real
 * incident — see below).
 *
 * WHAT WENT WRONG. The previous version was a bare
 * `<select defaultValue="STAFF">` next to an "Apply preset" button.
 * Three things compounded:
 *
 *  1. **The dropdown always read "Staff", for everyone.** No account
 *     type is stored per employee anywhere (the registry keys its
 *     defaults by Account Type, but nothing persists which one a person
 *     was given), so the control had no current value to show and fell
 *     back to the first one. Sitting beside a MANAGER's name, a select
 *     reading "Staff" looks like a *display of their current tier*. It
 *     wasn't — it was a loaded gun pointed at the STAFF preset.
 *  2. **One click overwrote 20 capability rows** with no confirmation,
 *     no diff, and no undo.
 *  3. **"Apply preset" sounds additive.** The action is a deliberate
 *     reset: it overwrites every registry capability to the preset's
 *     default and clears any per-item expiry.
 *
 * On 2026-08-21 that combination wiped every capability off an account
 * in a single click — driven by the app's own author, not a
 * low-computer-literacy user. Harmless (a TEST account) but the
 * mechanism governs production access.
 *
 * WHAT THIS DOES INSTEAD. Nothing is preselected, so no preset can be
 * applied by reflex; choosing one shows exactly what will change, by
 * name, before anything is written; and the wording says "reset", which
 * is what it is. An inline preview rather than a ConfirmDialog on
 * purpose — the diff can run to twenty lines, which a 360px modal
 * description string cannot show honestly.
 *
 * Error prevention over error messages (Nielsen 5 / poka-yoke), the
 * standing bar in project_atlas_target_users_accessibility memory.
 */
export function PresetApplyForm({ employee }: { employee: CapabilityMatrixEmployeeRow }) {
  const [state, formAction, pending] = useActionState(applyAccountTypePreset, initialState);
  const [choice, setChoice] = useState<"" | AccountType>("");
  const previewId = useId();

  /** Admins take the grantAllows() bypass, so their stored rows do not
   * determine their access. Applying a preset to an Admin rewrites the
   * rows and changes nothing about what they can reach — listing "turns
   * OFF (18)" for them would be crying wolf on the one account type
   * where the preview can never be right. */
  const isAdmin = employee.systemRole === "ADMIN";

  const diff = choice === "" ? null : computePresetDiff(employee.capabilities, choice);

  const nothingChanges = diff !== null && presetDiffIsEmpty(diff);

  return (
    <div className="w-full sm:w-auto">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="employeeId" value={employee.employeeId} />
        <label className="text-xs text-[var(--ink-500)]" htmlFor={`accountType-${employee.employeeId}`}>
          Reset to Account Type
        </label>
        <select
          id={`accountType-${employee.employeeId}`}
          name="accountType"
          value={choice}
          onChange={(e) => setChoice(e.target.value as "" | AccountType)}
          required
          aria-describedby={diff ? previewId : undefined}
          className="border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm px-2 py-1.5 min-h-11"
        >
          {/* Empty and selected by default: nothing can be applied by
              reflex, and the control never implies it is showing this
              person's current tier. */}
          <option value="">Choose a preset…</option>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        {/* Always rendered, never conditionally mounted. A form with no
            submit button submits on Enter (neither <select> nor a hidden
            input blocks implicit submission), which reproduced the exact
            one-input-wipes-everything incident for keyboard users:
            arrow to a preset, press Enter to close the dropdown, done —
            preview never read. A DISABLED default button stops implicit
            submission outright. Caught by the scrutinize pass. */}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={!diff || nothingChanges}
        >
          Reset
        </Button>
      </form>

      {/* Feedback sits directly under the control that caused it, ABOVE
          the preview panel — below it, on a 390px screen, an error can
          land off-screen. The success banner is additionally gated on
          nothingChanges: after a successful reset the page revalidates
          and the diff correctly collapses to "nothing would change", but
          if the admin then picks a DIFFERENT preset a stale "Preset
          applied." would otherwise render directly beneath a diff that
          has NOT been applied. */}
      {state.error && <p className="mt-2 text-xs text-[var(--danger)]">{state.error}</p>}
      {state.saved && !state.error && nothingChanges && (
        <div className="mt-2 max-w-md">
          <Banner tone="success" title="Preset applied." />
        </div>
      )}

      {diff && (
        <div
          id={previewId}
          aria-live="polite"
          className="mt-2 rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] px-3 py-2 text-xs text-[var(--ink-900)] max-w-md"
        >
          {nothingChanges ? (
            <p>
              <strong>{ACCOUNT_TYPE_LABELS[choice as AccountType]}</strong> matches what {employee.nickname} already
              has. Nothing would change.
            </p>
          ) : (
            <>
              <p className="font-semibold mb-1">
                This replaces {employee.nickname}&apos;s permissions with the{" "}
                {ACCOUNT_TYPE_LABELS[choice as AccountType]} preset:
              </p>
              <ul className="space-y-1">
                {diff.turningOn.length > 0 && (
                  <li>
                    <span className="font-medium">Turns ON ({diff.turningOn.length}):</span> {diff.turningOn.join(", ")}
                  </li>
                )}
                {diff.turningOff.length > 0 && (
                  <li>
                    <span className="font-medium text-[var(--danger-700)]">
                      Turns OFF ({diff.turningOff.length}):
                    </span>{" "}
                    {diff.turningOff.join(", ")}
                  </li>
                )}
                {diff.restoringExpired.length > 0 && (
                  <li>
                    {/* Deliberately worded as a restoration, not as
                        "clears the expiry date". The row already reads
                        granted=true, but the date has passed, so the
                        person does not hold it today — wiping the date
                        gives the access back. Burying that under a
                        date-formatting phrase would understate it, and
                        these are Financial Auditor capabilities. */}
                    <span className="font-medium">Gives back access that had expired:</span>{" "}
                    {diff.restoringExpired.join(", ")}
                  </li>
                )}
              </ul>
              <p className="mt-1.5 text-[var(--ink-700)]">
                Everything else stays as it is. This can&apos;t be undone in one step — you&apos;d have to set the
                capabilities back by hand.
              </p>
              {isAdmin && (
                <p className="mt-1.5 text-[var(--ink-700)]">
                  Note: {employee.nickname} is an Admin. Admins keep full access to everything regardless of these
                  settings, so this changes the stored values but not what they can actually open.
                </p>
              )}
            </>
          )}
        </div>
      )}


    </div>
  );
}
