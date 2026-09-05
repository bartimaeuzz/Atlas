"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSupplierInvoice, deleteDraftInvoice } from "@/lib/actions/supplierCheck";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

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
 * Still no typed confirmation, deliberately: getting here is already two
 * deliberate taps on a labelled control, and a draft invoice is the one
 * thing in this app that can simply be typed again. */
export function EditInvoiceForm({
  invoiceId,
  invoiceNumber,
  description,
  amount,
  onDone,
}: {
  invoiceId: number;
  invoiceNumber: string;
  description: string | null;
  amount: number;
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

  function handleDelete() {
    setError(null);
    setBusy("delete");
    startTransition(async () => {
      try {
        const result = await deleteDraftInvoice(invoiceId);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
        onDone();
      } catch (e) {
        // An async transition that throws with nothing catching it leaves
        // the manager watching a button spin forever, and every automated
        // check passes.
        setError(e instanceof Error ? e.message : String(e));
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
          onClick={handleDelete}
        >
          {busy === "delete" ? "Deleting…" : "Delete this invoice"}
        </Button>
        <p className="text-xs text-[var(--ink-500)] mt-1.5 text-center">
          Any photos of it go too. Only a draft can be deleted.
        </p>
      </div>
    </div>
  );
}
