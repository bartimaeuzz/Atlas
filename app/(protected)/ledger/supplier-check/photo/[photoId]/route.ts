import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { get } from "@vercel/blob";
import { db } from "@/db/client";
import { supplierInvoicePhotos } from "@/db/schema";
import { requireViewCapabilityRoute } from "@/lib/auth/requireRouteAccess";

/** Serves one invoice photo.
 *
 * A route handler gets NO protection from app/(protected)/layout.tsx —
 * that is what left four export handlers serving payroll to anonymous
 * requests for four days on 2026-08-21. So this authenticates itself,
 * on every request, before it looks anything up.
 *
 * It exists because the blobs are PRIVATE: their own URLs are not
 * fetchable without a Blob token, which the browser must never hold.
 * The photo is addressed by its row id rather than its pathname, so a
 * caller can never name a file this route did not choose to serve.
 *
 * Same capability as the Supplier Check page these photos appear on —
 * seeing the picture of an invoice is seeing the invoice. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  // requireViewCapabilityRoute, not requireCapabilityRoute: the latter
  // also demands systemRole MANAGER/ADMIN, which the photos page's own
  // hasCapability() gate does not. Using it here would render the page
  // for a non-manager holding VIEW_LEDGER_OVERVIEW and break every image
  // on it. The tier must match the page the data appears on.
  const denied = await requireViewCapabilityRoute("VIEW_LEDGER_OVERVIEW");
  if (denied) return denied;

  const photoId = Number((await params).photoId);
  if (!Number.isFinite(photoId) || photoId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [photo] = await db
    .select({ pathname: supplierInvoicePhotos.pathname })
    .from(supplierInvoicePhotos)
    .where(eq(supplierInvoicePhotos.id, photoId));
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blob = await get(photo.pathname, { access: "private" });
  if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // get() is a union discriminated on statusCode, and the 304 arm carries
  // `stream: null`. NextResponse accepts a null body, so handing the
  // stream over unchecked type-checks perfectly and serves an empty 200 —
  // a broken image with no error anywhere. Narrow instead of assuming a
  // conditional response can't come back from an unconditional request.
  if (blob.statusCode !== 200) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "content-type": blob.blob.contentType,
      // Private to this viewer's browser, never a shared or CDN cache:
      // the response is only correct for someone holding the capability.
      "cache-control": "private, max-age=3600",
    },
  });
}
