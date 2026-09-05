"use client";

import { useId, useState } from "react";
import { openInvoicePhotos, type InvoicePhotosView } from "@/lib/actions/supplierInvoicePhotos";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { BusyBar } from "@/components/ui/BusyBar";
import { InvoicePhotosClient } from "./[invoiceId]/photos/InvoicePhotosClient";

/** The photo marker on an invoice row, as a popup instead of a link
 * (2026-09-05, Oliver: "photos in a popup everywhere").
 *
 * These rows used to link out to /ledger/supplier-check/[id]/photos.
 * That is the same mistake the "+ Add item" popup was built to undo one
 * day earlier: the person tapping "No photo" is walking a list of twenty
 * bills against the paper stack, and navigating away costs them their
 * place in it — scroll position, which ones they had already checked,
 * everything. Coming back means finding their spot again by eye. A popup
 * keeps the list exactly where it was, so a photo is a detour of two
 * taps rather than a round trip.
 *
 * The page still exists and still works for anyone holding its URL; it
 * is simply no longer how the app sends people there.
 *
 * THE TRIGGER KEEPS ITS CALLER'S LOOK. Both lists already say the right
 * thing in the right colour — a quiet grey "3 photos", an orange "No
 * photo" warning — and those words are the caller's business, not this
 * component's. It takes over the behaviour and nothing else.
 */
export function InvoicePhotosButton({
  invoiceId,
  className,
  label,
  children,
}: {
  invoiceId: number;
  /** The trigger's classes. Same string the <Link> carried, so nothing
   *  about either list's appearance changes. */
  className?: string;
  /** What the trigger is, spoken in full. The visible text is "No photo"
   *  or "3 photos", which out of context does not say which invoice it
   *  belongs to — so the row passes the invoice number in.
   *
   *  MUST CONTAIN THE VISIBLE TEXT, and start with it. WCAG 2.5.3 Label
   *  in Name (level A): someone driving the screen by voice says the
   *  words they can see, and a name that does not contain them leaves
   *  the control unreachable. */
  label: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<InvoicePhotosView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setView(null);
    try {
      const result = await openInvoicePhotos(invoiceId);
      if (result.error) setError(result.error);
      else if (result.view) setView(result.view);
    } catch (e) {
      // Every path out of an async handler must land somewhere the user
      // can see. Without this the popup sits on its loading bar forever
      // and no automated check notices.
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function close() {
    setOpen(false);
    // Dropped, not kept: photos can change from the photos page, from the
    // "+ Add item" popup, or from another person's terminal, so the next
    // open re-reads rather than showing whatever this one happened to
    // see. Modal renders null while closed, so nothing paints the reset.
    setView(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        className={className}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        {children}
      </button>

      <Modal open={open} onClose={close} width={480} labelledBy={titleId}>
        <h2 id={titleId} className="text-base font-bold text-[var(--ink-900)]">
          Invoice photos
        </h2>
        {/* Which invoice this is. A popup has no page heading above it and
            no breadcrumb behind it, so without this line the dialog is a
            grid of paper photos with nothing saying whose. */}
        <p className="text-sm text-[var(--ink-500)] mb-3">
          {view ? `${view.vendorName} · invoice ${view.invoiceNumber} · ${view.receivedDate}` : " "}
        </p>

        {error && <Banner tone="danger" title="Couldn't open the photos" description={error} />}
        {!view && !error && <BusyBar label="Opening the photos…" />}

        {view && (
          <InvoicePhotosClient
            invoiceId={invoiceId}
            photos={view.photos}
            canEdit={view.canEdit}
            lockedReason={view.lockedReason}
          />
        )}

        <div className="flex justify-end mt-4">
          <Button variant="secondary" size="sm" onClick={close}>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}
