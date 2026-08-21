import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerVendors } from "@/db/schema";
import { VendorForm } from "../../VendorForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor] = await db.select().from(ledgerVendors).where(eq(ledgerVendors.id, Number(id)));

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/ledger/vendors" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Vendors
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-6">Edit vendor</h1>
      {vendor ? <VendorForm existing={vendor} /> : <p className="text-sm text-[var(--ink-500)]">Vendor not found.</p>}
    </main>
  );
}
