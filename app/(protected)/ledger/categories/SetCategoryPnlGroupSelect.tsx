"use client";

import { useTransition } from "react";
import { setLedgerCategoryPnlGroup } from "@/lib/actions/ledger";
import { Select } from "@/components/ui/Field";

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
 * own computed wage data is the payroll source of truth instead.
 *
 * `title=` kept deliberately (2026-08-19 retrofit pass) -- it's genuinely
 * supplementary here, not the only channel: every option's own visible
 * text already reads "P&L: <label>", so a screen reader / touch user
 * still gets the "this is the P&L bucket" context without the tooltip. */
export function SetCategoryPnlGroupSelect({ categoryId, pnlGroup }: { categoryId: number; pnlGroup: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="w-44 shrink-0">
      <Select
        value={pnlGroup}
        disabled={isPending}
        onChange={(e) => startTransition(() => setLedgerCategoryPnlGroup(categoryId, e.target.value))}
        title="Which P&L line this category's dollars roll up into"
      >
        {Object.entries(PNL_GROUP_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            P&amp;L: {label}
          </option>
        ))}
      </Select>
    </div>
  );
}
