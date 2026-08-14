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
