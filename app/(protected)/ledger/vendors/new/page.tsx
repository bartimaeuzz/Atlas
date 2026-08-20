import Link from "next/link";
import { VendorForm } from "../VendorForm";

export default function NewVendorPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/ledger/vendors" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Vendors
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-6">New vendor</h1>
      <VendorForm existing={null} />
    </main>
  );
}
