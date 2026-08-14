import { loadLedgerVendors, loadLedgerCategories } from "@/lib/ledger/loadLedgerAdmin";
import { loadPendingInvoicesByVendor, loadRecentSupplierPayments } from "@/lib/ledger/loadSupplierCheck";
import { LedgerTabs } from "../LedgerTabs";
import { LogInvoiceForm } from "./LogInvoiceForm";
import { PendingByVendor } from "./PendingByVendor";
import { PaymentHistory } from "./PaymentHistory";

/** Supplier Check (2026-08-14) -- invoice-based vendor payments, for
 * suppliers who drop an invoice at delivery and get paid later by
 * check, as opposed to Petty Cash's cash-on-delivery entries. See
 * project_atlas_ledger memory for the full design conversation: an
 * invoice is logged PENDING here, then one or more pending invoices
 * from the SAME vendor get marked paid together under one check. */
export default async function SupplierCheckPage() {
  const [vendors, categories, pendingGroups, recentPayments] = await Promise.all([
    loadLedgerVendors(),
    loadLedgerCategories(),
    loadPendingInvoicesByVendor(),
    loadRecentSupplierPayments(),
  ]);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Ledger</h1>
      <p className="text-neutral-500 text-sm mb-4">Invoice-based vendor payments, settled by check.</p>

      <LedgerTabs active="supplier" />

      <p className="text-neutral-500 text-sm mb-6">
        For vendors who drop an invoice at delivery and get paid later by check -- not
        cash-on-delivery (that&apos;s Petty Cash). Log each invoice as it arrives, then settle one
        or more pending invoices from the same vendor together when the check goes out.
      </p>

      <LogInvoiceForm vendors={vendors} categories={categories} />

      <h2 className="text-sm font-semibold text-neutral-600 mt-8 mb-2">Pending invoices</h2>
      {pendingGroups.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-3 mb-4">No pending invoices.</p>
      ) : (
        <div className="space-y-4 mb-4">
          {pendingGroups.map((g) => (
            <PendingByVendor key={g.vendorId} group={g} />
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-neutral-600 mt-8 mb-2">Recent payments</h2>
      <PaymentHistory payments={recentPayments} />
    </main>
  );
}
