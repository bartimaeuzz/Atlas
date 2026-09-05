"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctLoggedInvoice } from "@/lib/actions/supplierCheck";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useVendorCategoryPair } from "@/app/(protected)/ledger/useVendorCategoryPair";
import type { PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";
import { InvoiceFields } from "./InvoiceFields";
import type { LoggedInvoiceValues } from "./LogInvoiceForm";

/** "Edit details" on step 2 of the "+ Add item" popup (2026-09-05).
 *
 * The same six fields as step 1, prefilled with what was just saved, so
 * the person sees the form they recognise rather than a second, smaller
 * one that asks different questions. No reason field and no delete —
 * both settled with Oliver; the reasoning lives on correctLoggedInvoice.
 *
 * Cancel throws the edit away and goes back to the camera; Save writes
 * and goes back to the camera. Neither closes the popup, because the
 * photo is still the thing that has not happened yet. */
export function EditLoggedInvoiceForm({
  invoiceId,
  initial,
  vendors,
  categories,
  links,
  onSaved,
  onCancel,
}: {
  invoiceId: number;
  initial: LoggedInvoiceValues;
  vendors: PickerVendor[];
  categories: { id: number; name: string }[];
  links: VendorCategoryLinkProps;
  onSaved: (values: LoggedInvoiceValues) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  // The transition flag is not used; `busy` drives the button.
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    receivedDate: initial.receivedDate,
    invoiceNumber: initial.invoiceNumber,
    description: initial.description,
    amount: initial.amount,
  });
  const pair = useVendorCategoryPair(links, {
    vendorId: initial.vendorId,
    categoryId: initial.categoryId,
  });

  function handleSave() {
    const amount = Number(form.amount);
    // Checked here as well as on the server so the fix costs no round
    // trip — the server is still the one that decides.
    if (!form.receivedDate) return setError("Date received is required.");
    if (!pair.vendorId) return setError("Vendor is required.");
    if (!pair.categoryId) return setError("Category is required.");
    if (!form.invoiceNumber.trim()) return setError("Invoice number is required.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Amount must be a positive number.");

    setError(null);
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await correctLoggedInvoice({
          invoiceId,
          receivedDate: form.receivedDate,
          vendorId: Number(pair.vendorId),
          categoryId: Number(pair.categoryId),
          invoiceNumber: form.invoiceNumber,
          description: form.description,
          amount,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        // The list behind the popup carries this invoice's row already.
        router.refresh();
        onSaved({ ...form, vendorId: pair.vendorId, categoryId: pair.categoryId });
      } catch (e) {
        // An async transition that throws with nothing catching it leaves
        // the manager watching a button spin forever, and every automated
        // check passes.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    // A real form, not a div of buttons: step 1 is a form, Enter saves
    // there, and this is meant to be the same form. It also buys the
    // browser's own empty-field prevention ahead of the checks below —
    // stopping the save is better than reporting it (error prevention
    // over error messages).
    <form
      className="space-y-2 mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {error && <Banner tone="danger" title="Couldn't save the change" description={error} />}
      <InvoiceFields
        values={form}
        onChange={setForm}
        pair={pair}
        vendors={vendors}
        categories={categories}
        links={links}
      />
      {/* Cancel left, primary right -- 2026-08-24 consistency decision. */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
