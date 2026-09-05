"use client";

import { Select, TextInput } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { VendorPicker, type PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import { AUTOFILLED_CATEGORY_HINT, type useVendorCategoryPair } from "@/app/(protected)/ledger/useVendorCategoryPair";
import { CategorySuggestions } from "@/app/(protected)/ledger/CategorySuggestions";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";

/** What an invoice IS, as six fields — date, vendor, category, number,
 *  description, amount — in one place because two screens now draw them
 *  (2026-09-05): "+ Add item" step 1, and the correction form on step 2.
 *
 *  Shared rather than copied on purpose. The step-2 form is meant to look
 *  like the same form you just filled in, so a person recognises where
 *  they are instead of reading it as a different question. Two copies
 *  would drift the moment either gets a field.
 *
 *  Presentational only: it holds no state and calls no action. The host
 *  owns the values and decides what Save means. */
export interface InvoiceFieldValues {
  receivedDate: string;
  invoiceNumber: string;
  description: string;
  amount: string;
}

export function InvoiceFields({
  values,
  onChange,
  pair,
  vendors,
  categories,
  links,
}: {
  values: InvoiceFieldValues;
  onChange: (next: InvoiceFieldValues) => void;
  /** Vendor and category travel together — see useVendorCategoryPair. */
  pair: ReturnType<typeof useVendorCategoryPair>;
  vendors: PickerVendor[];
  categories: { id: number; name: string }[];
  links: VendorCategoryLinkProps;
}) {
  const set = (k: keyof InvoiceFieldValues) => (e: { target: { value: string } }) =>
    onChange({ ...values, [k]: e.target.value });
  /** Same, for MoneyField — it hands back the plain string rather than
   * an event, because the comma it displays must never reach state. */
  const setValue = (k: keyof InvoiceFieldValues) => (next: string) => onChange({ ...values, [k]: next });

  return (
    <>
      <TextInput
        type="date"
        name="receivedDate"
        label="Date received"
        required
        value={values.receivedDate}
        onChange={set("receivedDate")}
      />
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
      <TextInput
        type="text"
        name="invoiceNumber"
        label="Invoice number"
        required
        placeholder="e.g. 142675"
        value={values.invoiceNumber}
        onChange={set("invoiceNumber")}
      />
      <TextInput
        type="text"
        name="description"
        label="Nature / package (optional)"
        placeholder="e.g. weekly produce order"
        value={values.description}
        onChange={set("description")}
      />
      <MoneyField
        name="amount"
        label="Amount"
        required
        placeholder="0.00"
        value={values.amount}
        onValueChange={setValue("amount")}
      />
    </>
  );
}
