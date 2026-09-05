/** Invoice-photo constants and pure helpers — NOTHING that touches the
 *  database or the Blob store.
 *
 *  THIS FILE EXISTS TO KEEP A CLIENT BUNDLE CLEAN. `InvoicePhotosClient`
 *  needs MAX_PHOTOS_PER_INVOICE and the InvoicePhotoView shape. When
 *  those lived in lib/ledger/invoicePhotos.ts — which imports
 *  `@/db/client` for loadInvoicePhotos — importing the *value* pulled
 *  that whole module into the client bundle, libsql ran in the browser,
 *  and the photos page died on load with
 *  `LibsqlError: URL_SCHEME_NOT_SUPPORTED` (2026-09-05, caught by the
 *  live visual audit; tsc, eslint, 335 tests and `npm run build` all
 *  passed).
 *
 *  `import type` is erased at compile time and is always safe. A VALUE
 *  import is not. So: anything a "use client" file imports as a value
 *  belongs here, and nothing here may import `@/db/client`,
 *  `@/db/schema` or `@vercel/blob`.
 */

export const MAX_PHOTOS_PER_INVOICE = 6;

/** Comfortably under next.config.ts's 4mb server-action body cap, which
 *  applies to the whole multipart body rather than just the file. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface InvoicePhotoView {
  id: number;
  uploadedAt: string;
}

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
