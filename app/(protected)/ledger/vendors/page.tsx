import Link from "next/link";
import { loadLedgerVendors } from "@/lib/ledger/loadLedgerAdmin";
import { VendorsList } from "./VendorsList";
import { PageHeader } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Vendor/supplier directory admin (2026-08-14, Ledger v1). Seeded from
 * Soothr's real vendor list at Oliver's request ("for testing sake") —
 * Youk Thai is expected to edit/replace these with its own real vendors
 * before going live, see db/seed.ts's ledger section. Address fields
 * exist for a later check-export feature, not used anywhere yet. */
export default async function LedgerVendorsPage() {
  const vendors = await loadLedgerVendors();

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/ledger" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Ledger
      </Link>
      <PageHeader
        title="Vendors"
        description="Suppliers used on Petty Cash and Supplier Check entries. Retiring a vendor keeps every past entry that used it intact; it just stops being offered for new ones."
      />

      <VendorsList vendors={vendors} />
    </main>
  );
}
