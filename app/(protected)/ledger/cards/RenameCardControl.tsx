"use client";

import { useActionState, useState } from "react";
import { renameLedgerCard, type CardActionState } from "@/lib/actions/card";
import { Button } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const initialState: CardActionState = { error: null };

/** The card row's name slot (2026-08-24, third revision same day). At
 * rest: the name as plain text with a Rename link beside it. In edit:
 * the field appears IN THE NAME'S OWN POSITION -- Oliver: "make field
 * overlay on top of card name when in edit state" -- not off to the
 * right next to Retire where the first version put it, which left the
 * stale name text sitting beside the field. Save/Cancel ride with the
 * field; this whole component owns the left side of the row. */
export function RenameCardControl({ cardId, currentName }: { cardId: number; currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(renameLedgerCard, initialState);

  if (!editing) {
    return (
      <span className="flex items-center gap-3 min-w-0">
        <span className="text-[var(--ink-900)] truncate">{currentName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline shrink-0 ${TAP_TARGET_PAD}`}
        >
          Rename
        </button>
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
      <input type="hidden" name="cardId" value={cardId} />
      <input
        type="text"
        name="name"
        defaultValue={currentName}
        required
        autoFocus
        aria-label="Card name"
        className="border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm flex-1 min-w-32 max-w-64 bg-[var(--card)]"
      />
      <Button type="submit" size="sm" loading={isPending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={isPending}>
        Cancel
      </Button>
      {state.error && <span className="text-xs text-[var(--danger-700)] w-full">{state.error}</span>}
    </form>
  );
}
