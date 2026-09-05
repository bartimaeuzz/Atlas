"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { businessTodayIso } from "@/lib/formatDateTime";
import { logSupplierInvoice, type SupplierInvoiceActionState } from "@/lib/actions/supplierCheck";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { type PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import { useVendorCategoryPair } from "@/app/(protected)/ledger/useVendorCategoryPair";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";
import { InvoiceFields, type InvoiceFieldValues } from "./InvoiceFields";

const initialState: SupplierInvoiceActionState = { error: null };

/** Everything the manager typed, handed back to the caller alongside the
 *  new id (2026-09-05). Step 2 offers "Edit details", and it prefills from
 *  this rather than re-fetching the row it just wrote — the values are
 *  already here, and a round-trip would put a spinner in the middle of a
 *  20-second task. Strings, because that is what the fields take back. */
export interface LoggedInvoiceValues extends InvoiceFieldValues {
  vendorId: string;
  categoryId: string;
}

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
  onLogged?: (invoiceId: number, values: LoggedInvoiceValues) => void;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(logSupplierInvoice, initialState);

  const formRef = useKeepValuesOnError(isPending, !!state.error);
  // Controlled (2026-08-31): React 19 resets uncontrolled fields after a
  // form action — a server refusal wiped the whole invoice the manager
  // had typed. Same fix as InstantCheckButton; see
  // feedback-form-actions-reset-uncontrolled-fields.
  const [form, setForm] = useState<InvoiceFieldValues>({
    receivedDate: businessTodayIso(),
    invoiceNumber: "",
    description: "",
    amount: "",
  });
  // Vendor and category are controlled together, not separately -- see
  // useVendorCategoryPair.
  const pair = useVendorCategoryPair(links);

  // useActionState keeps the last result, so this would fire again on any
  // later re-render. The ref makes it once per invoice, not once per paint.
  // It also makes the form values safe to list as dependencies: the effect
  // re-runs on every keystroke and does nothing until an id it has not
  // seen arrives, which is the render where those values are what the
  // manager just submitted.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    const id = state.invoiceId;
    if (!id || handled.current === id) return;
    handled.current = id;
    if (onLogged) onLogged(id, { ...form, vendorId: pair.vendorId, categoryId: pair.categoryId });
    else router.push(`/ledger/supplier-check/${id}/photos`);
  }, [state.invoiceId, onLogged, router, form, pair.vendorId, pair.categoryId]);

  return (
    <form ref={formRef} action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2 mb-4">
      {state.error && <Banner tone="danger" title="Couldn't log invoice" description={state.error} />}
      <InvoiceFields
        values={form}
        onChange={setForm}
        pair={pair}
        vendors={vendors}
        categories={categories}
        links={links}
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Logging…" : "+ Log invoice"}
      </Button>
    </form>
  );
}
