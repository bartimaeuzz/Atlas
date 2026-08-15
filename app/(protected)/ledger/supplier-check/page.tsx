import Link from "next/link";
import { loadPendingInvoicesByVendor, loadSupplierChecks } from "@/lib/ledger/loadSupplierCheck";
import { LedgerTabs } from "../LedgerTabs";
import { PendingByVendor } from "./PendingByVendor";
import { ChecksTable } from "./ChecksTable";
import { ExportWeekButton } from "./ExportWeekButton";

/** Supplier Check (2026-08-14, restructured same day after Oliver talked
 * to Aey about the real workflow) -- invoice-based vendor payments, for
 * suppliers who drop an invoice at delivery and get paid later by
 * check, as opposed to Petty Cash's cash-on-delivery entries. See
 * project_atlas_ledger memory for the full design conversation.
 *
 * Real workflow, confirmed: "all invoices always get export to check
 * format at the end of the week" (the routine path -- Export Week's
 * Checks button below) but some vendors (e.g. maintenance) need a check
 * right after service, so a vendor can also be checked out instantly
 * from the "Not yet checked" section. Either path always combines EVERY
 * pending invoice for that vendor into one check ("same vendor always
 * get combined check"). Checks then move Printed -> Paid once actually
 * delivered to the supplier -- the holistic table below is every check
 * ever printed, not just paid ones. */
export default async function SupplierCheckPage() {
  const [pendingGroups, checks] = await Promise.all([loadPendingInvoicesByVendor(), loadSupplierChecks()]);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Ledger</h1>
      <p className="text-neutral-500 text-sm mb-4">Invoice-based vendor payments, settled by check.</p>

      <LedgerTabs active="supplier" />

      <div className="flex items-center justify-between gap-3 mb-6">
        <Link
          href="/ledger/supplier-check/new"
          className="px-4 py-2 rounded bg-black text-white text-sm hover:bg-neutral-800"
        >
          + Add item
        </Link>
        <ExportWeekButton disabled={pendingGroups.length === 0} />
      </div>

      {pendingGroups.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-neutral-600 mb-2">Not yet checked</h2>
          <div className="space-y-4 mb-6">
            {pendingGroups.map((g) => (
              <PendingByVendor key={g.vendorId} group={g} />
            ))}
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold text-neutral-600 mb-2">Checks</h2>
      <ChecksTable checks={checks} />
    </main>
  );
}
