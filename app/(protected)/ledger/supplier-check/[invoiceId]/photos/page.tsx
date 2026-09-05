import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, ledgerVendors } from "@/db/schema";
import { loadInvoicePhotos } from "@/lib/ledger/invoicePhotos";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { InvoicePhotosClient } from "./InvoicePhotosClient";

/** The photo screen for one invoice (2026-09-05, build-queue items 5+6).
 *
 * Its own page rather than a control buried in the invoice row: the
 * person logging an invoice is standing there holding the paper, so
 * logging redirects straight here and the camera is the one obvious
 * next action. The same page is where photos are reviewed and removed
 * later, so there is a single surface to learn instead of two. */
export default async function InvoicePhotosPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  if (!(await hasCapability("VIEW_LEDGER_OVERVIEW"))) return <NoAccess pageLabel="Supplier Check" />;

  const invoiceId = Number((await params).invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) notFound();

  const [invoice] = await db
    .select({
      id: supplierInvoices.id,
      invoiceNumber: supplierInvoices.invoiceNumber,
      amount: supplierInvoices.amount,
      status: supplierInvoices.status,
      receivedDate: supplierInvoices.receivedDate,
      vendorName: ledgerVendors.name,
    })
    .from(supplierInvoices)
    .innerJoin(ledgerVendors, eq(supplierInvoices.vendorId, ledgerVendors.id))
    .where(eq(supplierInvoices.id, invoiceId));
  if (!invoice) notFound();

  const photos = await loadInvoicePhotos(invoiceId);
  const canLog = await hasCapability("SUPPLIER_CHECK_LOG");
  const isDraft = invoice.status === "draft";

  // Two different reasons editing can be off, and they need different
  // words: the invoice moved past draft, or this person only has view
  // access. Saying "locked" for the second would be wrong.
  const lockedReason = !isDraft
    ? "This invoice has been approved, so its photos can't change. Ask the approver to send it back to draft first."
    : !canLog
      ? "You can look at these photos but not change them."
      : null;

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <Link
        href="/ledger/supplier-check"
        className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
      >
        &larr; Supplier
      </Link>
      <h1 className="text-2xl font-bold text-[var(--ink-900)] mt-2">Invoice photos</h1>
      <p className="text-sm text-[var(--ink-500)] mb-4">
        {invoice.vendorName} &middot; invoice {invoice.invoiceNumber} &middot; {invoice.receivedDate}
      </p>

      <InvoicePhotosClient
        invoiceId={invoice.id}
        photos={photos}
        canEdit={isDraft && canLog}
        lockedReason={lockedReason}
      />

      <Link
        href="/ledger/supplier-check"
        className="mt-6 block text-center text-sm font-semibold text-[var(--primary)] hover:underline py-3"
      >
        Done
      </Link>
    </main>
  );
}
