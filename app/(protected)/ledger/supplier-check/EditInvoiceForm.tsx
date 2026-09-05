"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSupplierInvoice, deleteDraftInvoice } from "@/lib/actions/supplierCheck";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "../formatMoney";

/** Inline "fix a typo or wrong amount" form (2026-08-15, Oliver's ask;
 * narrowed to DRAFT-only by the 2026-08-31 lifecycle rebuild — the old
 * auditor-PIN path for editing Printed/Paid invoices is retired: after
 * export nothing is edited, a mistake voids the whole check). Only
 * invoiceNumber / description / amount are editable -- vendor and
 * category aren't, changing those would be a much bigger structural
 * move than "typo or wrong amount," out of scope here.
 *
 * DELETING LIVES HERE TOO (2026-09-05, Oliver's call after a mockup).
 * It used to be a bare X on the invoice row, 8px from Approve — two
 * opposite outcomes on the same bill, a thumb apart, on a shared
 * terminal. No amount of padding fixes an adjacency; a wider box would
 * have overlapped Approve and made it worse.
 *
 * A kebab menu was the other candidate and was dropped: it would have
 * hidden Edit, which is the frequent action here (a wrong amount, a
 * wrong category), behind an unlabelled symbol — overflow menus are for
 * rare actions, and the reader is someone who is not confident with
 * computers. This shape costs no new component and follows what the app
 * already does with "Remove this photo", which lives inside the photo
 * viewer rather than on the thumbnail.
 *
 * IT ASKS FIRST (2026-09-05, Oliver's call, reversing the same day's
 * decision not to). The argument for going straight through was that two
 * deliberate taps on a labelled control is already enough. Two things
 * beat it: a draft invoice is NOT the only thing at stake — its photos
 * go with it, and a photo of a paper bill the driver has taken away
 * cannot be typed again — and Petty Cash has asked before removing an
 * expense since the 2026-08-21 audit, so the two money screens disagreed
 * about the same question.
 *
 * A plain ConfirmDialog, not the typed-word DangerConfirmDialog: the
 * heavy tier is for voiding a check, and making people type a word for
 * every draft trains them to type it without reading. The dialog names
 * the invoice, the vendor, the amount and the photo count, so what is
 * about to go is on screen rather than remembered — and it stays open if
 * the delete fails, so the reason is not hidden behind a dialog that
 * dismissed itself. */
export function EditInvoiceForm({
  invoiceId,
  invoiceNumber,
  description,
  amount,
  vendorName,
  photoCount,
  onDone,
}: {
  invoiceId: number;
  invoiceNumber: string;
  description: string | null;
  amount: number;
  /** Both only for the delete confirm's wording. */
  vendorName: string;
  photoCount: number;
  onDone: () => void;
}) {
  // `busy` below is the spinner state; the transition flag is not used.
  const [, startTransition] = useTransition();
  /** Which of the two actions is running — they share one transition but
   *  must not share a spinner, or deleting lights up the Save button. */
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const router = useRouter();
  const [form, setForm] = useState({
    invoiceNumber,
    description: description ?? "",
    amount: String(amount),
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleSave() {
    const parsedAmount = Number(form.amount);
    if (!form.invoiceNumber.trim()) {
      setError("Invoice number is required.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }
    if (!form.reason.trim()) {
      setError("A reason for this change is required — it's logged with the edit.");
      return;
    }
    setError(null);
    setBusy("save");
    startTransition(async () => {
      const result = await editSupplierInvoice({
        invoiceId,
        invoiceNumber: form.invoiceNumber,
        description: form.description,
        amount: parsedAmount,
        reason: form.reason,
      });
      setBusy(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  /** Runs only from the confirm dialog. Failures stay INSIDE it — the
   *  dialog closes on success alone, so a refusal is read where the eye
   *  already is rather than behind a dialog that dismissed itself. */
  function handleDelete() {
    setDeleteError(null);
    setBusy("delete");
    startTransition(async () => {
      try {
        const result = await deleteDraftInvoice(invoiceId);
        if (result.error) {
          setDeleteError(result.error);
          return;
        }
        setConfirmingDelete(false);
        router.refresh();
        onDone();
      } catch (e) {
        // An async transition that throws with nothing catching it leaves
        // the manager watching a button spin forever, and every automated
        // check passes.
        setDeleteError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--card)] space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <TextInput
          label="Invoice #"
          value={form.invoiceNumber}
          onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
        />
        <TextInput
          type="number"
          label="Amount"
          step="0.01"
          min="0"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
      </div>
      <TextInput
        label="Description"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <TextInput
        label="Reason for this change — logged with the edit"
        value={form.reason}
        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
        placeholder="e.g. amount was a typo, should be $45 not $54"
      />
      {error && <Banner tone="danger" title={error} />}
      {/* Cancel left, primary right -- 2026-08-24 consistency decision. */}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" loading={busy === "save"} disabled={busy !== null} onClick={handleSave}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Below its own rule, and below Save, so the destructive control is
          nowhere near the one a person came here to press. Full width and
          spelled out: the word "Delete" and the word "invoice" both have
          to be read before this is tapped, which the bare X it replaces
          could not claim. */}
      <div className="border-t border-[var(--border)] pt-3 mt-3">
        <Button
          type="button"
          variant="destructive-outline"
          className="w-full"
          loading={busy === "delete"}
          disabled={busy !== null}
          onClick={() => {
            setDeleteError(null);
            setConfirmingDelete(true);
          }}
        >
          {busy === "delete" ? "Deleting…" : "Delete this invoice"}
        </Button>
        <p className="text-xs text-[var(--ink-500)] mt-1.5 text-center">
          Any photos of it go too. Only a draft can be deleted.
        </p>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this invoice?"
        description={`#${invoiceNumber} · ${vendorName} — ${formatMoney(amount)}. ${
          photoCount === 0
            ? "This deletes the invoice for good."
            : `This deletes the invoice and its ${photoCount} photo${photoCount === 1 ? "" : "s"} for good.`
        } It can't be undone.`}
        confirmLabel="Delete"
        loading={busy === "delete"}
        body={deleteError ? <Banner tone="danger" title="Couldn't delete it" description={deleteError} /> : undefined}
        onConfirm={handleDelete}
      />
    </div>
  );
}
