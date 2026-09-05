"use client";

import { useActionState, useId, useState, useSyncExternalStore } from "react";
import { renameLedgerCard, type CardActionState } from "@/lib/actions/card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: CardActionState = { error: null };

/** lg-and-up, live. useSyncExternalStore rather than state-in-effect --
 * the eslint set-state-in-effect rule bit this codebase once already.
 * Server snapshot says desktop; editing always starts closed, so the
 * first paint never shows the wrong variant. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

/** The card row's name slot (2026-08-24, fourth revision same day). At
 * rest: name text + Rename link. Editing on DESKTOP: the field appears
 * in the name's own position ("overlay on top of card name"). Editing
 * on a PHONE: a Modal instead -- inline, the field plus Save/Cancel
 * wrapped onto a second row inside the 390px list row, which is the
 * "button got drop to the next row" Oliver called weird. One shared
 * form body so the two variants can't drift. */
export function RenameCardControl({ cardId, currentName }: { cardId: number; currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(renameLedgerCard, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  const isDesktop = useIsDesktop();
  const titleId = useId();

  const formBody = (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
      <input type="hidden" name="cardId" value={cardId} />
      <input
        type="text"
        name="name"
        defaultValue={currentName}
        required
        autoFocus
        aria-label="Card name"
        className="border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 flex-1 min-w-32 max-w-64 bg-[var(--card)]"
      />
      {/* Cancel left, primary right -- 2026-08-24 consistency decision. */}
      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" size="sm" loading={isPending}>
        Save
      </Button>
      {state.error && <span className="text-xs text-[var(--danger-700)] w-full">{state.error}</span>}
    </form>
  );

  if (editing && isDesktop) return formBody;

  return (
    <>
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
      <Modal open={editing && !isDesktop} onClose={() => setEditing(false)} width={320} labelledBy={titleId}>
        <div id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-3">
          Rename card
        </div>
        {formBody}
      </Modal>
    </>
  );
}
