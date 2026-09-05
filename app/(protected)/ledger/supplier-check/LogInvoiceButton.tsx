"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { LogInvoiceForm } from "./LogInvoiceForm";
import { InvoicePhotosClient } from "./[invoiceId]/photos/InvoicePhotosClient";
import type { PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";

/** "+ Add item" as a popup over the Invoices page instead of a separate
 * /new page (2026-08-31, Oliver's ask — logging a bill is a 20-second
 * task and shouldn't cost the page context).
 *
 * TWO STEPS IN ONE POPUP (2026-09-05, Oliver picked this shape from a
 * mockup). Logging redirected to the photo screen for one day, which
 * threw away the very page context this popup exists to keep. Now the
 * popup stays put and swaps to the camera.
 *
 * THE ORDER IS THE POINT — save, THEN photograph. The invoice is a
 * committed row before the camera is touched, so a dead battery, a
 * dropped upload or someone walking in cannot take a hand-typed bill
 * with it. Putting the file input in the form instead would have been
 * one tap fewer and would have tied the save to the upload; the same
 * reasoning already says approving without a photo stays allowed,
 * because a camera must never stop the week.
 *
 * Step 2 is genuinely optional, and the exit button says so out loud:
 * "Finish without a photo" until one is attached, "Done" after. Skipping
 * stays one tap — it just can't happen by accident any more. The list
 * marks that invoice "No photo" until someone adds one. */
export function LogInvoiceButton({
  vendors,
  categories,
  links,
}: {
  vendors: PickerVendor[];
  categories: { id: number; name: string }[];
  links: VendorCategoryLinkProps;
}) {
  const titleId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** null while the form is up; the new invoice's id once it is saved. */
  const [loggedId, setLoggedId] = useState<number | null>(null);
  const [photoCount, setPhotoCount] = useState(0);

  function close() {
    setOpen(false);
    // Back to step 1, so the next bill starts on the form. Safe to do in
    // the same tick: Modal returns null while closed, so nothing renders
    // the reset. Both setStates batch into one paint either way.
    setLoggedId(null);
    setPhotoCount(0);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Add item
      </Button>

      <Modal open={open} onClose={close} width={448} labelledBy={titleId}>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h3 id={titleId} className="text-base font-bold text-[var(--ink-900)]">
            {loggedId === null ? "Log an invoice" : "Photo of the bill"}
          </h3>
          {/* Says where you are and that there is more after this one.
              Without it, saving the invoice looks like the whole job is
              finished and the popup has simply changed its mind. */}
          <span className="shrink-0 text-xs font-medium text-[var(--ink-500)] tabular-nums">
            Step {loggedId === null ? 1 : 2} of 2
          </span>
        </div>

        {loggedId === null ? (
          <LogInvoiceForm
            vendors={vendors}
            categories={categories}
            links={links}
            onLogged={(id) => {
              setLoggedId(id);
              // The list behind the popup gains its new draft row now,
              // rather than when the popup closes — nothing navigates
              // any more, so nothing else would fetch it.
              router.refresh();
            }}
          />
        ) : (
          <div className="space-y-3 mb-4">
            {/* INFO, not SUCCESS (2026-09-05, Oliver testing it: "my first
                gut said it is done"). A green tint and a tick are the
                universal finished signal, and colour is read before text,
                so the old banner contradicted the "Step 2 of 2" beside it
                and won. Neutral indigo and a plain circle report the fact
                without calling the job over. The sentence carries forward
                rather than back: it asks for the next thing. */}
            <Banner tone="info" title="Saved. Please add a photo." />
            <InvoicePhotosClient
              invoiceId={loggedId}
              photos={[]}
              canEdit
              lockedReason={null}
              onCountChange={setPhotoCount}
            />
          </div>
        )}

        <div className="flex justify-end">
          {/* The exit button names its own consequence (2026-09-05). "Done"
              on a photoless invoice reads as "you are finished", which is
              exactly the misread this step caused. A person cannot skip by
              accident when the button says what skipping is — and this
              costs nothing to anyone who does take a photo, unlike a
              confirm dialog, which would nag the people doing it right and
              train everyone to tap through the confirmations that matter.
              Once a photo is attached it IS done, so the word comes back.
              The list's own orange "No photo" marker is the backstop. */}
          <Button variant="secondary" size="sm" onClick={close}>
            {loggedId === null ? "Cancel" : photoCount === 0 ? "Finish without a photo" : "Done"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
