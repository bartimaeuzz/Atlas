"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { businessTodayIso } from "@/lib/formatDateTime";
import { logSupplierInvoice, type SupplierInvoiceActionState } from "@/lib/actions/supplierCheck";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { VendorPicker, type PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import { AUTOFILLED_CATEGORY_HINT, useVendorCategoryPair } from "@/app/(protected)/ledger/useVendorCategoryPair";
import { CategorySuggestions } from "@/app/(protected)/ledger/CategorySuggestions";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: SupplierInvoiceActionState = { error: null };

/** Logging an invoice is its own form, separate from Petty Cash's
 * AddEntryForm -- Oliver's own words: "the input form on petty cash
 * now won't work on delivery invoice based supplier." No amount-paid,
 * no due date field (confirmed not needed) -- just what arrived and
 * when, so it can sit as pending until a check settles it later. */
export function LogInvoiceForm({
  vendors,
  categories,
  links,
  onLogged,
}: {
  vendors: PickerVendor[];
  categories: { id: number; name: string }[];
  links: VendorCategoryLinkProps;
  /** What happens once the invoice exists (2026-09-05). The "+ Add item"
   *  popup passes a handler and swaps itself to the photo step, so the
   *  invoice list never moves. With no handler — the /new page — this
   *  navigates to the photo screen, which is what the action used to do
   *  with a redirect of its own. */
  onLogged?: (invoiceId: number) => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(logSupplierInvoice, initialState);

  // useActionState keeps the last result, so this would fire again on any
  // later re-render. The ref makes it once per invoice, not once per paint.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    const id = state.invoiceId;
    if (!id || handled.current === id) return;
    handled.current = id;
    if (onLogged) onLogged(id);
    else router.push(`/ledger/supplier-check/${id}/photos`);
  }, [state.invoiceId, onLogged, router]);
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  // Controlled (2026-08-31): React 19 resets uncontrolled fields after a
  // form action — a server refusal wiped the whole invoice the manager
  // had typed. Same fix as InstantCheckButton; see
  // feedback-form-actions-reset-uncontrolled-fields.
  const [form, setForm] = useState({
    receivedDate: businessTodayIso(),
    invoiceNumber: "",
    description: "",
    amount: "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Vendor and category are controlled together, not separately -- see
  // useVendorCategoryPair.
  const pair = useVendorCategoryPair(links);

  return (
    <form ref={formRef} action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      {state.error && <Banner tone="danger" title="Couldn't log invoice" description={state.error} />}
      <TextInput type="date" name="receivedDate" label="Date received" required value={form.receivedDate} onChange={set("receivedDate")} />
      <div className="grid grid-cols-2 gap-2 items-start">
        <VendorPicker
          name="vendorId"
          label="Vendor"
          required
          vendors={vendors}
          value={pair.vendorId}
          onChange={pair.setVendorId}
          categoryId={pair.categoryId}
          links={links}
        />
        <div>
          <Select
            name="categoryId"
            label="Category"
            required
            value={pair.categoryId}
            onChange={(e) => pair.setCategoryId(e.target.value)}
            hint={pair.categoryAutofilled ? AUTOFILLED_CATEGORY_HINT : undefined}
          >
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <CategorySuggestions
            categoryIds={pair.suggestedCategoryIds}
            categories={categories}
            onPick={pair.setCategoryId}
          />
        </div>
      </div>
      <TextInput type="text" name="invoiceNumber" label="Invoice number" required placeholder="e.g. 142675" value={form.invoiceNumber} onChange={set("invoiceNumber")} />
      <TextInput type="text" name="description" label="Nature / package (optional)" placeholder="e.g. weekly produce order" value={form.description} onChange={set("description")} />
      <TextInput
        type="number"
        name="amount"
        label="Amount"
        step="0.01"
        min="0.01"
        required
        placeholder="0.00"
        inputMode="decimal"
        value={form.amount}
        onChange={set("amount")}
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Logging…" : "+ Log invoice"}
      </Button>
    </form>
  );
}
