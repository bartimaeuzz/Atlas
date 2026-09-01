"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LogInvoiceForm } from "./LogInvoiceForm";
import type { TaggedVendor } from "@/app/(protected)/ledger/VendorPicker";

/** "+ Add item" as a popup over the Supplier Check page instead of a
 * separate /new page (2026-08-31, Oliver's ask — logging a bill is a
 * 20-second task and shouldn't cost the page context). The form inside
 * is the same LogInvoiceForm the /new page hosts; its action redirects
 * back to /ledger/supplier-check on success, which reloads this page
 * with the new draft visible and the modal gone. The /new page stays
 * for deep links. */
export function LogInvoiceButton({
  vendors,
  categories,
}: {
  vendors: TaggedVendor[];
  categories: { id: number; name: string }[];
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Add item
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} width={448} labelledBy={titleId}>
        <h3 id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-2">
          Log an invoice
        </h3>
        <LogInvoiceForm vendors={vendors} categories={categories} />
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
