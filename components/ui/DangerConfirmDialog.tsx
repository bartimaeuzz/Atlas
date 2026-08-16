"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertCircleIcon } from "./icons";

/** Typed-word confirm — reserved for truly irreversible, high-blast-radius
 * actions only (delete a shift/employee, wipe a report). Button stays
 * disabled until the typed word matches exactly. Don't reach for this for
 * every destructive action -- that trains a "just type it" reflex that
 * defeats the point; use ConfirmDialog for anything less severe. */
export function DangerConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmWord = "DELETE",
  confirmLabel,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmWord?: string;
  confirmLabel?: string;
  loading?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === confirmWord;

  function handleClose() {
    setTyped("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} width={360}>
      <div className="flex items-center gap-2 mb-2">
        <AlertCircleIcon className="text-[var(--danger)]" width={20} height={20} />
        <span className="text-base font-bold text-[var(--ink-900)]">{title}</span>
      </div>
      <p className="text-sm text-[var(--ink-700)] mb-3.5">{description}</p>
      <label className="block text-xs font-semibold text-[var(--ink-700)] mb-1.5">
        Type <strong>{confirmWord}</strong> to confirm
      </label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={confirmWord}
        className="w-full border border-[var(--border-strong)] rounded-[var(--radius-md)] px-3 py-2.5 text-base mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--danger-border)] focus:border-[var(--danger)]"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirm} disabled={!matches} loading={loading}>
          {confirmLabel ?? title}
        </Button>
      </div>
    </Modal>
  );
}
