"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

/** Lightweight "are you sure" confirm — for reversible-ish or lower-stakes
 * actions (e.g. adding a second role to someone already on the roster).
 * Primary-blue confirm button, not red: this tier is NOT for destructive
 * actions, see DangerConfirmDialog for those. Replaces raw window.confirm()
 * calls found in RosterGrid.tsx (2026-08-16 verification pass). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} width={360}>
      <div className="text-base font-bold text-[var(--ink-900)] mb-1.5">{title}</div>
      {description && <p className="text-sm text-[var(--ink-700)] mb-4">{description}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
