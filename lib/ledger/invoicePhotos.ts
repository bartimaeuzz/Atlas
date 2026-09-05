import { eq, asc } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db/client";
import { supplierInvoicePhotos } from "@/db/schema";

/** Plain (non-action) helpers for supplier invoice photos.
 *
 * These deliberately do NOT live in lib/actions/supplierInvoicePhotos.ts.
 * Every export of a "use server" module is published as a callable
 * endpoint, so putting deleteBlobQuietly() there would have shipped a
 * "delete any file by pathname" action reachable by anything that can
 * POST to the app. Same class of mistake as the 2026-08-21 unauthed
 * export routes: the danger is the reachability, not the code. */

export const MAX_PHOTOS_PER_INVOICE = 6;

/** Comfortably under next.config.ts's 4mb server-action body cap, which
 *  applies to the whole multipart body rather than just the file. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Plain-language message for the one failure a manager can act on: the
 *  Blob store has not been created in Vercel yet. Anything else is
 *  reported as it came. */
export function describeStoreError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/BLOB_READ_WRITE_TOKEN|No token found|store not found/i.test(message)) {
    return "Photo storage isn't set up yet. Ask Oliver to create the Blob store in Vercel.";
  }
  return message;
}

/** Best-effort blob cleanup. Callers have already committed the row
 *  change; a storage hiccup must not roll that back. A file whose row is
 *  gone is unreachable by anyone — a storage cost, not a correctness
 *  problem. */
export async function deleteBlobQuietly(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    // Deliberately swallowed — see above.
  }
}

export interface InvoicePhotoView {
  id: number;
  uploadedAt: string;
}

/** Every photo on one invoice, oldest first — the order they were taken,
 *  which for a multi-page invoice is page order. */
export async function loadInvoicePhotos(invoiceId: number): Promise<InvoicePhotoView[]> {
  return db
    .select({ id: supplierInvoicePhotos.id, uploadedAt: supplierInvoicePhotos.uploadedAt })
    .from(supplierInvoicePhotos)
    .where(eq(supplierInvoicePhotos.invoiceId, invoiceId))
    .orderBy(asc(supplierInvoicePhotos.id));
}
