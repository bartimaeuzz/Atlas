"use client";

import { useActionState } from "react";
import { createLedgerVendor, updateLedgerVendor, type LedgerAdminActionState } from "@/lib/actions/ledger";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

interface Vendor {
  id: number;
  name: string;
  payeeAddressLine1: string | null;
  payeeAddressLine2: string | null;
  payeeAddressLine3: string | null;
}

const initialState: LedgerAdminActionState = { error: null };

export function VendorForm({
  existing,
  existingTags = [],
  allTags = [],
}: {
  existing: Vendor | null;
  /** This vendor's current tags (edit mode). */
  existingTags?: string[];
  /** Every tag already in use across vendors — shown for reuse so
   * spellings converge instead of fragmenting (2026-08-31). */
  allTags?: string[];
}) {
  const action = existing ? updateLedgerVendor : createLedgerVendor;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3 max-w-sm">
      {existing && <input type="hidden" name="vendorId" value={existing.id} />}
      {state.error && <Banner tone="danger" title="Couldn't save vendor" description={state.error} />}
      <TextInput type="text" name="name" label="Name" defaultValue={existing?.name ?? ""} required />
      <TextInput
        type="text"
        name="tags"
        label="Tags (optional)"
        defaultValue={existingTags.join(", ")}
        placeholder="e.g. Bar, Produce"
        hint={
          "Comma-separated. Tags become filter chips on the vendor picker when logging petty cash or an invoice — a vendor can carry several." +
          (allTags.length > 0 ? ` Already in use: ${allTags.join(", ")}.` : "")
        }
      />
      <TextInput
        type="text"
        name="payeeAddressLine1"
        label="Address line 1 (optional)"
        defaultValue={existing?.payeeAddressLine1 ?? ""}
      />
      <TextInput
        type="text"
        name="payeeAddressLine2"
        label="Address line 2 (optional)"
        defaultValue={existing?.payeeAddressLine2 ?? ""}
      />
      <TextInput
        type="text"
        name="payeeAddressLine3"
        label="City, State ZIP (optional)"
        defaultValue={existing?.payeeAddressLine3 ?? ""}
      />
      <Button type="submit" loading={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
