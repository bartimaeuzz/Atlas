"use client";

import { useActionState } from "react";
import { createLedgerVendor, updateLedgerVendor, type LedgerAdminActionState } from "@/lib/actions/ledger";

interface Vendor {
  id: number;
  name: string;
  payeeAddressLine1: string | null;
  payeeAddressLine2: string | null;
  payeeAddressLine3: string | null;
}

const initialState: LedgerAdminActionState = { error: null };

export function VendorForm({ existing }: { existing: Vendor | null }) {
  const action = existing ? updateLedgerVendor : createLedgerVendor;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      {existing && <input type="hidden" name="vendorId" value={existing.id} />}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">Name</span>
        <input
          type="text"
          name="name"
          defaultValue={existing?.name ?? ""}
          required
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">Address line 1 (optional)</span>
        <input
          type="text"
          name="payeeAddressLine1"
          defaultValue={existing?.payeeAddressLine1 ?? ""}
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">Address line 2 (optional)</span>
        <input
          type="text"
          name="payeeAddressLine2"
          defaultValue={existing?.payeeAddressLine2 ?? ""}
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">City, State ZIP (optional)</span>
        <input
          type="text"
          name="payeeAddressLine3"
          defaultValue={existing?.payeeAddressLine3 ?? ""}
          className="border rounded px-3 py-2 text-sm w-full"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
