"use client";

import { useTransition } from "react";
import { toggleLedgerCardActive } from "@/lib/actions/card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export function ToggleCardActiveButton({ cardId, nextActive }: { cardId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleLedgerCardActive(cardId, nextActive))}
      className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
