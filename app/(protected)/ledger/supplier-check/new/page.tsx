import Link from "next/link";
import { loadLedgerVendorsWithTags, loadLedgerCategories } from "@/lib/ledger/loadLedgerAdmin";
import { LogInvoiceForm } from "../LogInvoiceForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** Dedicated "Add item" page (2026-08-14 restructure) -- same pattern as
 * Vendors/Positions' /new pages: the form's action redirects back to
 * /ledger/supplier-check on success, staying put (with the error shown)
 * on failure. Kept off the main Supplier Check page so that page can
 * lead with the checks table instead of an always-open form. */
export default async function NewSupplierInvoicePage() {
  if (!(await hasCapability("VIEW_LEDGER_OVERVIEW"))) return <NoAccess pageLabel="Supplier Check" />;

  const [allVendors, categories] = await Promise.all([loadLedgerVendorsWithTags(), loadLedgerCategories()]);
  const vendors = allVendors.filter((v) => v.active);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <Link href="/ledger/supplier-check" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Supplier
      </Link>
      <h1 className="text-2xl font-bold text-[var(--ink-900)] mt-2 mb-4">Log an invoice</h1>
      <LogInvoiceForm vendors={vendors} categories={categories} />
    </main>
  );
}
