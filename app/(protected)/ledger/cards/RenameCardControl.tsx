"use client";

import { useActionState, useState } from "react";
import { renameLedgerCard, type CardActionState } from "@/lib/actions/card";
import { Button } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const initialState: CardActionState = { error: null };

/** Inline card rename (2026-08-24, Oliver: "card name can be edit with
 * permission"). Rendered only for LEDGER_CARD_MANAGE holders -- the page
 * resolves that server-side and simply doesn't mount this for anyone
 * else; the server action re-checks independently. Edit-in-place rather
 * than a route: same one-field pattern as CardForm right below it. */
export function RenameCardControl({ cardId, currentName }: { cardId: number; currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(renameLedgerCard, initialState);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
      >
        Rename
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="cardId" value={cardId} />
      <input
        type="text"
        name="name"
        defaultValue={currentName}
        required
        autoFocus
        className="border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm w-40 bg-[var(--card)]"
      />
      <Button type="submit" size="sm" loading={isPending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={isPending}>
        Cancel
      </Button>
      {state.error && <span className="text-xs text-[var(--danger-700)]">{state.error}</span>}
    </form>
  );
}
