"use client";

import { useActionState } from "react";
import { createLedgerCategory, type LedgerAdminActionState } from "@/lib/actions/ledger";

const initialState: LedgerAdminActionState = { error: null };

export function CategoryForm() {
  const [state, formAction, isPending] = useActionState(createLedgerCategory, initialState);

  return (
    <form action={formAction}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          name="name"
          placeholder="New category name"
          required
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        {/* P&L bucket (2026-08-16, Analytics/P&L feature) -- which line
            this category's dollars roll up into on the P&L. Defaults to
            Other, editable any time afterward from the list below. */}
        <select name="pnlGroup" defaultValue="OTHER_EXPENSE" className="border rounded px-2 py-2 text-sm text-neutral-600 shrink-0">
          <option value="FOOD">P&amp;L: Food</option>
          <option value="BEVERAGE_NONALC">P&amp;L: Drinks (non-alc)</option>
          <option value="BEVERAGE_ALC">P&amp;L: Bar (alcohol)</option>
          <option value="OTHER_EXPENSE">P&amp;L: Other expense</option>
          <option value="EXCLUDED">P&amp;L: Excluded</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50 shrink-0"
        >
          {isPending ? "Adding…" : "+ Add"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}
