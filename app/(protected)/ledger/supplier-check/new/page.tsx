import Link from "next/link";
import { loadLedgerVendors, loadLedgerCategories } from "@/lib/ledger/loadLedgerAdmin";
import { LogInvoiceForm } from "../LogInvoiceForm";

/** Dedicated "Add item" page (2026-08-14 restructure) -- same pattern as
 * Vendors/Positions' /new pages: the form's action redirects back to
 * /ledger/supplier-check on success, staying put (with the error shown)
 * on failure. Kept off the main Supplier Check page so that page can
 * lead with the checks table instead of an always-open form. */
export default async function NewSupplierInvoicePage() {
  const [vendors, categories] = await Promise.all([loadLedgerVendors(), loadLedgerCategories()]);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <Link href="/ledger/supplier-check" className="text-sm text-neutral-500 hover:text-black">
        &larr; Supplier
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">Log an invoice</h1>
      <LogInvoiceForm vendors={vendors} categories={categories} />
    </main>
  );
}
