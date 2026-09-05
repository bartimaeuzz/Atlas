import { eq, asc } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db/client";
import { supplierInvoicePhotos } from "@/db/schema";
import type { InvoicePhotoView } from "./invoicePhotoLimits";

/** Server-only helpers for supplier invoice photos.
 *
 * These deliberately do NOT live in lib/actions/supplierInvoicePhotos.ts.
 * Every export of a "use server" module is published as a callable
 * endpoint, so putting deleteBlobQuietly() there would have shipped a
 * "delete any file by pathname" action reachable by anything that can
 * POST to the app. Same class of mistake as the 2026-08-21 unauthed
 * export routes: the danger is the reachability, not the code.
 *
 * NOTHING IN A "use client" FILE MAY IMPORT A VALUE FROM HERE. This
 * module imports @/db/client, so a value import drags libsql into the
 * browser bundle and the page dies on load — that is exactly what broke
 * the photos page on 2026-09-05. The constants a client needs live in
 * ./invoicePhotoLimits.ts instead; `import type` from here is fine
 * because types are erased. */

export async function deleteBlobQuietly(pathname: string): Promise<void> {
  // Best-effort blob cleanup. Callers have already committed the row
  // change; a storage hiccup must not roll that back. A file whose row is
  // gone is unreachable by anyone — a storage cost, not a correctness
  // problem.
  try {
    await del(pathname);
  } catch {
    // Deliberately swallowed — see above.
  }
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
