"use client";

import { useTransition } from "react";
import { toggleLedgerCardActive } from "@/lib/actions/card";

export function ToggleCardActiveButton({ cardId, nextActive }: { cardId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleLedgerCardActive(cardId, nextActive))}
      className="text-xs text-neutral-500 hover:text-black underline disabled:opacity-50"
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
