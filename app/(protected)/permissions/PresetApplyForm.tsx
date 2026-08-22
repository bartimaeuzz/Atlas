"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
 * WHAT THIS DOES INSTEAD, in three layers:
 *
 *  1. Nothing is preselected — the select opens on "Choose a preset…",
 *     so the control never implies it is showing the person's current
 *     tier, and no preset can be applied by reflex.
 *  2. Choosing one renders an inline preview naming every capability
 *     that turns on, turns off, or gets restored. Inline rather than
 *     inside the dialog because the diff runs to twenty lines, which a
 *     360px modal description string cannot show honestly.
 *  3. Every submission — pointer OR keyboard — is intercepted at the
 *     form's onSubmit and must pass a ConfirmDialog first.
 *
 * Layer 3 exists because the first version of this fix had only 1 and 2,
 * and a live audit broke it in one keystroke: the Reset button is the
 * form's default button, so pressing Enter on the closed select
 * activated it and rewrote all 20 rows with the preview unread. Gating
 * the BUTTON only covers the case where nothing is chosen yet. Gating
 * the FORM covers every path into the action, which is the property
 * actually wanted.
 *
 * Error prevention over error messages (Nielsen 5 / poka-yoke), the
 * standing bar in project_atlas_target_users_accessibility memory.
 */
export function PresetApplyForm({ employee }: { employee: CapabilityMatrixEmployeeRow }) {
  const [state, formAction, pending] = useActionState(applyAccountTypePreset, initialState);
  const [choice, setChoice] = useState<"" | AccountType>("");
  const previewId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  /** A ref, not state: the confirm handler has to flip this and re-submit
   * within the same tick, before React has re-rendered. */
  const confirmedRef = useRef(false);

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
      {/* Guarded at onSubmit, NOT by gating the button — the distinction
          is the whole fix, and the first attempt got it wrong.
          Conditionally rendering or disabling the button only stops the
          reflex case where nothing is chosen. Once a real preset is
          picked the button is live, and it is the form's DEFAULT button:
          arrow to a preset, press Enter to dismiss the dropdown, and
          Enter activates it — 20 rows rewritten, preview never read.
          Verified live on 2026-08-22 by doing exactly that and watching
          the DB go to zero.

          Intercepting here catches BOTH paths (pointer and keyboard)
          because every submission, however triggered, runs onSubmit. The
          worst an errant Enter can now do is open a dialog. */}
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(e) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return; // let the confirmed submission through
          }
          e.preventDefault();
          if (diff && !nothingChanges) setConfirmOpen(true);
        }}
        className="flex flex-wrap items-center gap-2"
      >
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

        {/* Always rendered, never conditionally mounted — a form with no
            submit button submits on Enter anyway (neither <select> nor a
            hidden input blocks implicit submission), so removing the
            button would make things worse, not better. Disabling it does
            stop the no-choice case. It does NOT stop Enter once a real
            preset is picked; that is what the onSubmit guard above is
            for. Both are needed. */}
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
              {/* Before the list, not after it: a reader who sees
                  "Turns OFF (20)" and only then learns it doesn't apply
                  to them has already had the fright. */}
              {isAdmin && (
                <p className="mb-1.5 text-[var(--ink-700)]">
                  {employee.nickname} is an Admin, and Admins keep full access to everything regardless of these
                  settings. This changes the stored values below, but not what they can actually open.
                </p>
              )}
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
            </>
          )}
        </div>
      )}


      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          confirmedRef.current = true;
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={`Reset ${employee.nickname} to ${choice === "" ? "" : ACCOUNT_TYPE_LABELS[choice]}?`}
        description={
          diff
            ? `This turns ON ${diff.turningOn.length + diff.restoringExpired.length} and turns OFF ${diff.turningOff.length} of their permissions, replacing what they have now. The full list is on the page behind this box. It can't be undone in one step.`
            : undefined
        }
        confirmLabel="Yes, reset"
        loading={pending}
      />
    </div>
  );
}
