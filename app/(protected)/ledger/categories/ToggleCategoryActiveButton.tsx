"use client";

import { useTransition } from "react";
import { toggleLedgerCategoryActive } from "@/lib/actions/ledger";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export function ToggleCategoryActiveButton({ categoryId, nextActive }: { categoryId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleLedgerCategoryActive(categoryId, nextActive))}
      className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
