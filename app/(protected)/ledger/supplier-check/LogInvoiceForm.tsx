"use client";

import { useActionState } from "react";
import { businessTodayIso } from "@/lib/formatDateTime";
import { logSupplierInvoice, type SupplierInvoiceActionState } from "@/lib/actions/supplierCheck";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { VendorPicker, type TaggedVendor } from "@/app/(protected)/ledger/VendorPicker";

const initialState: SupplierInvoiceActionState = { error: null };

/** Logging an invoice is its own form, separate from Petty Cash's
 * AddEntryForm -- Oliver's own words: "the input form on petty cash
 * now won't work on delivery invoice based supplier." No amount-paid,
 * no due date field (confirmed not needed) -- just what arrived and
 * when, so it can sit as pending until a check settles it later. */
export function LogInvoiceForm({
  vendors,
  categories,
}: {
  vendors: TaggedVendor[];
  categories: { id: number; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(logSupplierInvoice, initialState);

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      {state.error && <Banner tone="danger" title="Couldn't log invoice" description={state.error} />}
      <TextInput type="date" name="receivedDate" label="Date received" required defaultValue={businessTodayIso()} />
      <div className="grid grid-cols-2 gap-2">
        <VendorPicker name="vendorId" label="Vendor" required vendors={vendors} />
        <Select name="categoryId" label="Category" required>
          <option value="">Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <TextInput type="text" name="invoiceNumber" label="Invoice number" required placeholder="e.g. 142675" />
      <TextInput type="text" name="description" label="Nature / package (optional)" placeholder="e.g. weekly produce order" />
      <TextInput
        type="number"
        name="amount"
        label="Amount"
        step="0.01"
        min="0.01"
        required
        placeholder="0.00"
        inputMode="decimal"
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Logging…" : "+ Log invoice"}
      </Button>
    </form>
  );
}
