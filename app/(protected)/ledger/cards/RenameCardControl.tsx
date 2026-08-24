"use client";

import { useActionState } from "react";
import { renameLedgerCard, type CardActionState } from "@/lib/actions/card";
import { Button } from "@/components/ui/Button";

const initialState: CardActionState = { error: null };

/** Card name as an always-editable field (2026-08-24, Oliver's revision
 * of the same-day Rename button: "instead of popup field to edit, just
 * change name to field box"). Rendered only for LEDGER_CARD_MANAGE
 * holders -- everyone else gets the plain text name from the page. Save
 * sits beside the field rather than saving on blur: an explicit commit
 * matches the rest of the app, and a stray tap can't silently rename a
 * card that appears on statements. */
export function RenameCardControl({ cardId, currentName }: { cardId: number; currentName: string }) {
  const [state, formAction, isPending] = useActionState(renameLedgerCard, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
      <input type="hidden" name="cardId" value={cardId} />
      <input
        type="text"
        name="name"
        defaultValue={currentName}
        required
        aria-label="Card name"
        className="border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm flex-1 min-w-32 max-w-64 bg-[var(--card)]"
      />
      <Button type="submit" size="sm" variant="secondary" loading={isPending}>
        Save
      </Button>
      {state.error && <span className="text-xs text-[var(--danger-700)] w-full">{state.error}</span>}
    </form>
  );
}
