"use client";

import { useId, useRef } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/** Lightweight "are you sure" confirm — for reversible-ish or lower-stakes
 * actions (e.g. adding a second role to someone already on the roster).
 * Primary-blue confirm button, not red: this tier is NOT for destructive
 * actions, see DangerConfirmDialog for those. Replaces raw window.confirm()
 * calls found in RosterGrid.tsx (2026-08-16 verification pass).
 *
 * Focus lands on CANCEL, not Confirm (2026-08-22, Oliver's call): a stray
 * Enter or Space on an unfamiliar dialog should dismiss it, never fire the
 * action it was asking about. That is error-prevention-over-error-messages
 * applied to the keyboard, and it costs a confirming user exactly one Tab. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  loading,
  confirmDisabled,
  body,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  /** Blocks the confirm until the dialog's own body is complete — e.g. a
   *  second person's PIN has been typed. Error prevention over error
   *  messages: the button that cannot succeed should not look ready
   *  (2026-09-01, two-person money controls). */
  confirmDisabled?: boolean;
  /** Optional slot between the description and the buttons — for an inline
   *  error Banner when the confirmed action fails, so the failure is shown
   *  where the user is looking instead of behind a dismissed dialog
   *  (added 2026-08-22, Positions retrofit). */
  body?: React.ReactNode;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal open={open} onClose={onClose} width={360} labelledBy={titleId} initialFocus={cancelRef}>
      <div id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-1.5">
        {title}
      </div>
      {description && <p className="text-sm text-[var(--ink-700)] mb-4">{description}</p>}
      {body && <div className="mb-4">{body}</div>}
      <div className="flex gap-2 justify-end">
        <Button ref={cancelRef} variant="secondary" size="sm" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
