"use client";

import { useTransition } from "react";
import { toggleLedgerCategoryActive } from "@/lib/actions/ledger";

export function ToggleCategoryActiveButton({ categoryId, nextActive }: { categoryId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleLedgerCategoryActive(categoryId, nextActive))}
      className="text-xs text-neutral-500 hover:text-black underline disabled:opacity-50"
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
