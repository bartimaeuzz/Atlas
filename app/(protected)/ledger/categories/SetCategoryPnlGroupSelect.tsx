"use client";

import { useTransition } from "react";
import { setLedgerCategoryPnlGroup } from "@/lib/actions/ledger";

const PNL_GROUP_LABELS: Record<string, string> = {
  FOOD: "Food",
  BEVERAGE_NONALC: "Drinks (non-alc)",
  BEVERAGE_ALC: "Bar (alcohol)",
  OTHER_EXPENSE: "Other expense",
  EXCLUDED: "Excluded",
};

/** Re-tags a category's P&L bucket (2026-08-16, Analytics/P&L feature) --
 * see setLedgerCategoryPnlGroup's own comment for why this is the single
 * source of truth the P&L rollup reads. "Excluded" is a real, intentional
 * option here (not a mistake state) -- it's how the PAYROLL BOH/PAYROLL
 * FOH categories stay out of the P&L without deleting them, since Atlas's
 * own computed wage data is the payroll source of truth instead. */
export function SetCategoryPnlGroupSelect({ categoryId, pnlGroup }: { categoryId: number; pnlGroup: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      value={pnlGroup}
      disabled={isPending}
      onChange={(e) => startTransition(() => setLedgerCategoryPnlGroup(categoryId, e.target.value))}
      className="text-xs border rounded px-1.5 py-1 text-neutral-500 disabled:opacity-50"
      title="Which P&L line this category's dollars roll up into"
    >
      {Object.entries(PNL_GROUP_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          P&amp;L: {label}
        </option>
      ))}
    </select>
  );
}
