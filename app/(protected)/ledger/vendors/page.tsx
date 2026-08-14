import Link from "next/link";
import { loadLedgerVendors } from "@/lib/ledger/loadLedgerAdmin";
import { VendorsList } from "./VendorsList";

/** Vendor/supplier directory admin (2026-08-14, Ledger v1). Seeded from
 * Soothr's real vendor list at Oliver's request ("for testing sake") —
 * Youk Thai is expected to edit/replace these with its own real vendors
 * before going live, see db/seed.ts's ledger section. Address fields
 * exist for a later check-export feature, not used anywhere yet. */
export default async function LedgerVendorsPage() {
  const vendors = await loadLedgerVendors();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/ledger" className="text-sm text-neutral-500 hover:text-black">
        &larr; Ledger
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Vendors</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Suppliers used on Petty Cash and (later) Supplier Check entries. Retiring a vendor keeps
        every past entry that used it intact; it just stops being offered for new ones.
      </p>

      <VendorsList vendors={vendors} />
    </main>
  );
}
