"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadInvoicePhoto, removeInvoicePhoto } from "@/lib/actions/supplierInvoicePhotos";
import { MAX_PHOTOS_PER_INVOICE } from "@/lib/ledger/invoicePhotoLimits";
import type { InvoicePhotoView } from "@/lib/ledger/invoicePhotoLimits";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { BusyBar } from "@/components/ui/BusyBar";
import { Modal } from "@/components/ui/Modal";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** The longest edge we keep. An invoice is read, not admired: 1800px
 *  across a US Letter page is ~150 dpi, comfortably enough to read a
 *  line item, and it turns a 4-5MB phone photo into 200-400KB. That
 *  keeps every upload far under next.config.ts's 4mb action-body cap
 *  and keeps the archive cheap for a restaurant on slow wifi. */
const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.8;

/** Re-encode whatever the phone produced into a modest JPEG.
 *
 *  This does three jobs at once, and all three are needed for the plain
 *  "take a picture" round to actually work on a real phone:
 *   - SIZE: a raw camera photo blows the action-body cap on its own.
 *   - FORMAT: an iPhone photo library hands out HEIC, which Chrome and
 *     Firefox cannot display at all. Safari can decode it to a canvas,
 *     so the conversion happens on the one browser that can do it.
 *   - ROTATION: browsers apply EXIF orientation when drawing an <img>,
 *     so a photo taken sideways is stored the way it was seen rather
 *     than arriving on its side in the viewer. */
async function toUploadableJpeg(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This device can't open that file as a picture. Try taking the photo again."));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This device can't process the photo. Try a different phone or tablet.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("This device can't process the photo. Try a different phone or tablet.");

    return new File([blob], "invoice.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function InvoicePhotosClient({
  invoiceId,
  photos: initialPhotos,
  canEdit,
  lockedReason,
}: {
  invoiceId: number;
  /** Seeds the list ONCE, on mount. After that this component owns the
   *  list: the upload action hands back the row it created and the
   *  thumbnail appears from that, rather than from a server round-trip.
   *  It has to work this way because the same component also runs inside
   *  the "+ Add item" popup, where nothing server-rendered is holding a
   *  photo list to refresh into. `router.refresh()` still fires, for the
   *  invoice list's own "2 photos" / "No photo" marker. */
  photos: InvoicePhotoView[];
  /** Draft + holds SUPPLIER_CHECK_LOG. Mirrors the server's own rule;
   *  the server is what enforces it. */
  canEdit: boolean;
  /** Why editing is off, in plain words — shown instead of the buttons
   *  so the state reads as a fact rather than as a failure. */
  lockedReason: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<InvoicePhotoView[]>(initialPhotos);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const full = photos.length >= MAX_PHOTOS_PER_INVOICE;

  async function handleFile(file: File) {
    setError(null);
    setBusy("upload");
    try {
      const jpeg = await toUploadableJpeg(file);
      const fd = new FormData();
      fd.set("invoiceId", String(invoiceId));
      fd.set("photo", jpeg);
      const result = await uploadInvoicePhoto(fd);
      if (result.error) setError(result.error);
      else if (result.photo) {
        setPhotos((list) => [...list, result.photo!]);
        router.refresh();
      }
    } catch (e) {
      // Every path out of here clears `busy` — an async handler that
      // throws without one of these leaves the user watching a spinner
      // that never stops, and no automated check would catch it.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = ""; // let the same file be re-picked
    }
  }

  async function handleRemove(photoId: number) {
    setError(null);
    setBusy("remove");
    try {
      const result = await removeInvoicePhoto(photoId);
      if (result.error) setError(result.error);
      else {
        setPhotos((list) => list.filter((p) => p.id !== photoId));
        setViewing(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Banner tone="danger" title="Couldn't save the photo" description={error} />}
      {lockedReason && <Banner tone="info" title="Photos are locked" description={lockedReason} announce={false} />}

      {photos.length === 0 ? (
        <p className="text-sm text-[var(--ink-500)] border border-dashed border-[var(--border)] rounded-[var(--radius-lg)] p-6 text-center">
          No photo of this invoice yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setViewing(photo.id)}
                className="block w-full aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)] bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served
                    by our own authed route, not an optimizable static asset */}
                <img
                  src={`/ledger/supplier-check/photo/${photo.id}`}
                  alt={`Invoice photo ${i + 1} of ${photos.length}`}
                  className="w-full h-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy === "upload" && <BusyBar label="Saving the photo…" />}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            // No `capture` attribute on purpose: with plain accept="image/*"
            // iOS offers Take Photo AND Photo Library in one menu, so a
            // picture taken a minute ago in the kitchen is still reachable.
            // `capture` would force the camera and hide the library.
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button
            type="button"
            className="w-full"
            loading={busy === "upload"}
            disabled={full || busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {/* "another photo", not "another page" (2026-09-05, Oliver).
                "Page" reads as a page of the app. "Attach file" was the
                other candidate and was dropped: this input takes images
                only and refuses a PDF, which is exactly what the word
                "file" invites someone to try. */}
            {photos.length === 0 ? "+ Add a photo" : "+ Add another photo"}
          </Button>
          {full && (
            <p className="text-xs text-[var(--ink-500)] text-center">
              That&rsquo;s {MAX_PHOTOS_PER_INVOICE} photos — the most one invoice can hold. Remove one to add another.
            </p>
          )}
        </>
      )}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} width={560} labelledBy="invoice-photo-title">
        <div className="flex items-center justify-between mb-2">
          <h2 id="invoice-photo-title" className="font-semibold text-[var(--ink-900)]">
            Invoice photo
          </h2>
          <button
            type="button"
            onClick={() => setViewing(null)}
            aria-label="Close photo"
            className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
          >
            <XIcon />
          </button>
        </div>
        {viewing !== null && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
            <img
              src={`/ledger/supplier-check/photo/${viewing}`}
              alt="The paper invoice, full size"
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)]"
            />
            {busy === "remove" && (
              <div className="mt-3">
                <BusyBar label="Removing the photo…" />
              </div>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="destructive-outline"
                className="w-full mt-3"
                loading={busy === "remove"}
                disabled={busy !== null}
                onClick={() => void handleRemove(viewing)}
              >
                Remove this photo
              </Button>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
