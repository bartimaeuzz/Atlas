import Link from "next/link";
import { loadPendingInvoicesByVendor, loadSupplierChecks } from "@/lib/ledger/loadSupplierCheck";
import { LedgerTabs } from "../LedgerTabs";
import { PendingByVendor } from "./PendingByVendor";
import { ChecksTable } from "./ChecksTable";
import { PrintChecksButton } from "./PrintChecksButton";

/** Supplier Check (2026-08-14, restructured twice same day after Oliver
 * talked to Aey about the real workflow, then flagged two more follow-
 * ups) -- invoice-based vendor payments, for suppliers who drop an
 * invoice at delivery and get paid later by check, as opposed to Petty
 * Cash's cash-on-delivery entries. See project_atlas_ledger memory for
 * the full design conversation.
 *
 * Real workflow, confirmed: "all invoices always get export to check
 * format at the end of the week" (the routine path) but some vendors
 * (e.g. maintenance) need a check right after service (the instant
 * path) -- both now go through ONE "Print Checks" popup where a manager
 * checks off exactly which vendors to print for right now, one/some/all
 * ("i want a flexibility to print some but not all or print all").
 * Printing always combines EVERY pending invoice for the chosen
 * vendor(s) into one check each ("same vendor always get combined
 * check"). Checks then move Printed -> Paid once actually delivered to
 * the supplier -- the holistic table below is every check ever printed,
 * not just paid ones, and every row (Printed or Paid) can be Reprinted
 * at any time, since clicking Print in the app isn't the same as it
 * actually coming out of a physical printer. */
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
        <PrintChecksButton groups={pendingGroups} />
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
