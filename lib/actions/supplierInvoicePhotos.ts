"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/db/client";
import { supplierInvoices, supplierInvoicePhotos } from "@/db/schema";
import { requireCapability } from "@/lib/permissions/requireCapability";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_INVOICE,
  deleteBlobQuietly,
  describeStoreError,
} from "@/lib/ledger/invoicePhotos";

/** Photos of the paper invoice (2026-09-05, build-queue items 5+6).
 *
 * ONLY the two actions below may be exported from this file — every
 * export of a "use server" module becomes a callable endpoint, so the
 * helpers live in lib/ledger/invoicePhotos.ts instead.
 *
 * WHY A SERVER ACTION AND NOT @vercel/blob/client's handleUpload: that
 * flow needs one public route serving BOTH the browser's token request
 * (carries the staff session) and Vercel's upload-completed webhook
 * (arrives from their servers with no session at all), so the route is
 * partly anonymous by design — the exact shape of the 2026-08-21
 * incident where four export handlers served payroll to anonymous
 * requests. An action keeps ONE authenticated path with no anonymous
 * branch. The cost is Next's 4mb body cap (next.config.ts), which the
 * client's downscale-before-upload keeps us far below: a 1800px JPEG off
 * a phone camera lands around 200-400KB.
 *
 * Blobs are PRIVATE, not public. A public blob URL is readable by anyone
 * holding the link, forever, with no login and no revocation short of
 * deleting the file — and an invoice photo shows the vendor and the
 * amount. They are served through
 * app/(protected)/ledger/supplier-check/photo/[photoId]/route.ts, which
 * re-checks the viewer's capability on every request.
 *
 * THE LOCK: attaching and removing are DRAFT-only, enforced here. The UI
 * mirrors it; this is what makes it true. Once an invoice is ready, the
 * picture the approver looked at can no longer change — same reasoning
 * as the amount itself. */

export interface PhotoActionResult {
  error: string | null;
}

export async function uploadInvoicePhoto(formData: FormData): Promise<PhotoActionResult> {
  let invoiceId = 0;
  try {
    const session = await requireCapability("SUPPLIER_CHECK_LOG");

    invoiceId = Number(formData.get("invoiceId"));
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new Error("Missing invoice.");

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new Error("No photo was chosen.");
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      throw new Error("That file isn't a photo Atlas can read. Use the camera, or pick a JPG or PNG.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("That photo is too big. Take it again with the camera button.");
    }

    const [invoice] = await db
      .select({ status: supplierInvoices.status })
      .from(supplierInvoices)
      .where(eq(supplierInvoices.id, invoiceId));
    if (!invoice) throw new Error("That invoice no longer exists.");
    if (invoice.status !== "draft") {
      throw new Error(
        "This invoice is approved, so its photos are locked. Ask the approver to send it back to draft first."
      );
    }

    const existing = await db
      .select({ id: supplierInvoicePhotos.id })
      .from(supplierInvoicePhotos)
      .where(eq(supplierInvoicePhotos.invoiceId, invoiceId));
    if (existing.length >= MAX_PHOTOS_PER_INVOICE) {
      throw new Error(`An invoice can hold ${MAX_PHOTOS_PER_INVOICE} photos. Remove one first.`);
    }

    // addRandomSuffix so two pages of the same invoice never collide, and
    // so a pathname cannot be guessed from the invoice number.
    const stored = await put(`supplier-invoices/${invoiceId}/page.jpg`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
    });

    await db.insert(supplierInvoicePhotos).values({
      invoiceId,
      url: stored.url,
      pathname: stored.pathname,
      uploadedByEmployeeId: session.id,
    });
  } catch (e) {
    // Returned, never thrown: a thrown server-action error is redacted to
    // a generic digest in production, leaving the manager nothing to act on.
    return { error: describeStoreError(e) };
  }

  revalidatePath("/ledger/supplier-check");
  revalidatePath(`/ledger/supplier-check/${invoiceId}/photos`);
  return { error: null };
}

export async function removeInvoicePhoto(photoId: number): Promise<PhotoActionResult> {
  let invoiceId = 0;
  try {
    await requireCapability("SUPPLIER_CHECK_LOG");

    const [photo] = await db
      .select({
        invoiceId: supplierInvoicePhotos.invoiceId,
        pathname: supplierInvoicePhotos.pathname,
        status: supplierInvoices.status,
      })
      .from(supplierInvoicePhotos)
      .innerJoin(supplierInvoices, eq(supplierInvoicePhotos.invoiceId, supplierInvoices.id))
      .where(eq(supplierInvoicePhotos.id, photoId));

    if (!photo) return { error: null }; // already gone — nothing to undo
    if (photo.status !== "draft") {
      throw new Error("This invoice is approved, so its photos are locked.");
    }
    invoiceId = photo.invoiceId;

    await db.delete(supplierInvoicePhotos).where(eq(supplierInvoicePhotos.id, photoId));
    await deleteBlobQuietly(photo.pathname);
  } catch (e) {
    return { error: describeStoreError(e) };
  }

  revalidatePath("/ledger/supplier-check");
  revalidatePath(`/ledger/supplier-check/${invoiceId}/photos`);
  return { error: null };
}
