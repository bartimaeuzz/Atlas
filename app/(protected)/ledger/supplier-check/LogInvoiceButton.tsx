"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { LogInvoiceForm, type LoggedInvoiceValues } from "./LogInvoiceForm";
import { EditLoggedInvoiceForm } from "./EditLoggedInvoiceForm";
import { InvoicePhotosClient } from "./[invoiceId]/photos/InvoicePhotosClient";
import { formatMoney } from "../formatMoney";
import type { PickerVendor } from "@/app/(protected)/ledger/VendorPicker";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";
import { useRouter } from "next/navigation";

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
 * marks that invoice "No photo" until someone adds one.
 *
 * STEP 2 ALSO SHOWS WHAT WAS SAVED, and lets it be fixed (2026-09-05).
 * Saving first is what makes the photo safe, but it also means the form
 * is gone at the exact moment a person looks up from the paper bill and
 * spots the wrong supplier. Reading it back on step 2 is the check that
 * the old redirect-to-a-photo-page shape never offered; "Edit details"
 * is the fix, in place, with the popup still open. */
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
  /** null while the form is up; the new invoice once it is saved. The
   *  values ride along so step 2 can show them back and prefill the
   *  correction form without a fetch. */
  const [logged, setLogged] = useState<{ id: number; values: LoggedInvoiceValues } | null>(null);
  const [editing, setEditing] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);

  /** Swapping in the correction form is a context change with no focus
   *  change to match it: the button that was pressed goes display:none
   *  with the rest of step 2, which drops focus on <body> and tells a
   *  screen-reader user nothing at all. Focus lands on the heading in
   *  both directions instead — it is the dialog's own label, and it has
   *  just been rewritten to say where you now are. Skipped on the first
   *  render so it cannot fight Modal's own open-time focus. */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [editing]);

  function close() {
    setOpen(false);
    // Back to step 1, so the next bill starts on the form. Safe to do in
    // the same tick: Modal returns null while closed, so nothing renders
    // the reset. Both setStates batch into one paint either way.
    setLogged(null);
    setEditing(false);
    setPhotoCount(0);
  }

  const step = logged === null ? 1 : 2;
  const title = editing ? "Edit invoice details" : step === 1 ? "Log an invoice" : "Photo of the bill";

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Add item
      </Button>

      <Modal open={open} onClose={close} width={448} labelledBy={titleId}>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h3 ref={headingRef} tabIndex={-1} id={titleId} className="text-base font-bold text-[var(--ink-900)] outline-none">
            {title}
          </h3>
          {/* Says where you are and that there is more after this one.
              Without it, saving the invoice looks like the whole job is
              finished and the popup has simply changed its mind.

              Gone while editing: correcting a typo is a detour off step 2,
              not a third step, and leaving "Step 2 of 2" over a form that
              is not step 2 would say something untrue. */}
          {!editing && (
            <span className="shrink-0 text-xs font-medium text-[var(--ink-500)] tabular-nums">
              Step {step} of 2
            </span>
          )}
        </div>

        {logged === null ? (
          <LogInvoiceForm
            vendors={vendors}
            categories={categories}
            links={links}
            onLogged={(id, values) => {
              setLogged({ id, values });
              // The list behind the popup gains its new draft row now,
              // rather than when the popup closes — nothing navigates
              // any more, so nothing else would fetch it.
              router.refresh();
            }}
          />
        ) : (
          <>
            {editing && (
              <EditLoggedInvoiceForm
                invoiceId={logged.id}
                initial={logged.values}
                vendors={vendors}
                categories={categories}
                links={links}
                onSaved={(values) => {
                  setLogged({ id: logged.id, values });
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            )}

            {/* HIDDEN, NOT UNMOUNTED, while the correction form is up.
                InvoicePhotosClient owns its own photo list after mount —
                unmounting it would throw away thumbnails already
                uploaded and re-seed from the empty array below. */}
            <div className={editing ? "hidden" : "space-y-3 mb-4"}>
              {/* INFO, not SUCCESS (2026-09-05, Oliver testing it: "my first
                  gut said it is done"). A green tint and a tick are the
                  universal finished signal, and colour is read before text,
                  so the old banner contradicted the "Step 2 of 2" beside it
                  and won. Neutral indigo and a plain circle report the fact
                  without calling the job over. The sentence carries forward
                  rather than back: it asks for the next thing.

                  AND IT STOPS ASKING ONCE A PHOTO IS THERE (2026-09-05).
                  It used to say "Please add a photo" over a thumbnail of
                  the photo, beside a button already reading "Done" — the
                  screen contradicting itself, with the contradiction sat
                  at the top where it is read first. It still carries
                  forward; there is simply a different next thing now. */}
              <Banner
                tone="info"
                title={photoCount === 0 ? "Saved. Please add a photo." : "Saved. You can close this now."}
              />

              <InvoiceSummary
                values={logged.values}
                vendors={vendors}
                categories={categories}
                onEdit={() => setEditing(true)}
              />

              <InvoicePhotosClient
                invoiceId={logged.id}
                photos={[]}
                canEdit
                lockedReason={null}
                onCountChange={setPhotoCount}
              />
            </div>
          </>
        )}

        {/* The correction form carries its own Cancel and Save, and a
            second exit button beside them would be a third choice on a
            two-choice screen. */}
        {!editing && (
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
              {step === 1 ? "Cancel" : photoCount === 0 ? "Finish without a photo" : "Done"}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}

/** What was just saved, read back in one block (2026-09-05).
 *
 * It is here so the mistake is visible without anyone tapping anything.
 * An "Edit details" button on its own would only help the person who
 * already knows they got it wrong; the numbers on screen are what let
 * someone glance from the paper bill to the phone and catch it. Vendor
 * and amount lead, because those are the two that cost money when wrong. */
function InvoiceSummary({
  values,
  vendors,
  categories,
  onEdit,
}: {
  values: LoggedInvoiceValues;
  vendors: PickerVendor[];
  categories: { id: number; name: string }[];
  onEdit: () => void;
}) {
  const vendorName = vendors.find((v) => String(v.id) === values.vendorId)?.name ?? "—";
  const categoryName = categories.find((c) => String(c.id) === values.categoryId)?.name ?? "—";
  const amount = Number(values.amount);
  // Trimmed the way the server trims them, so this reads back what was
  // stored rather than what was typed — a description of spaces is a
  // null column, and must not draw an empty line here.
  const invoiceNumber = values.invoiceNumber.trim();
  const description = values.description.trim();

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--card)] text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-[var(--ink-900)]">{vendorName}</div>
          <div className="text-xs text-[var(--ink-500)]">
            #{invoiceNumber} · {categoryName}
          </div>
          {description && <div className="text-xs text-[var(--ink-500)]">{description}</div>}
          <div className="text-xs text-[var(--ink-500)] opacity-75">{values.receivedDate}</div>
        </div>
        <span className="font-medium tabular-nums text-[var(--ink-900)] shrink-0">
          {Number.isFinite(amount) ? formatMoney(amount) : values.amount}
        </span>
      </div>
      {/* Full width and spelled out rather than a pencil icon: the reader
          may not be confident with computers, and this is the one control
          on step 2 that is not the camera. */}
      <Button type="button" variant="secondary" size="sm" className="w-full mt-2" onClick={onEdit}>
        Edit details
      </Button>
    </div>
  );
}
