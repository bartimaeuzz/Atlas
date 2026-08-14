import Link from "next/link";
import { VendorForm } from "../VendorForm";

export default function NewVendorPage() {
  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/ledger/vendors" className="text-sm text-neutral-500 hover:text-black">
        &larr; Vendors
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-6">New vendor</h1>
      <VendorForm existing={null} />
    </main>
  );
}
