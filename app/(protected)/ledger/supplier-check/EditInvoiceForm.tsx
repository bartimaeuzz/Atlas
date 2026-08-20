"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSupplierInvoice } from "@/lib/actions/supplierCheck";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/** Shared inline "fix a typo or wrong amount" form (2026-08-15, Oliver's
 * ask) -- used both for a still-Pending invoice (PendingByVendor.tsx, no
 * confirmation code needed) and an already-Printed/Paid one
 * (ChecksTable.tsx, requireAuditorCode=true). Only invoiceNumber /
 * description / amount are editable -- vendor and category aren't,
 * changing those would be a much bigger structural move than "typo or
 * wrong amount," out of scope here. Server-side gating (who's even
 * allowed to call this, and the code check itself) all lives in
 * editSupplierInvoice -- this component just collects the fields and
 * shows whatever error comes back. */
export function EditInvoiceForm({
  invoiceId,
  invoiceNumber,
  description,
  amount,
  requireAuditorCode,
  onDone,
}: {
  invoiceId: number;
  invoiceNumber: string;
  description: string | null;
  amount: number;
  requireAuditorCode: boolean;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({
    invoiceNumber,
    description: description ?? "",
    amount: String(amount),
    reason: "",
    auditorCode: "",
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
      setError("A reason for this change is required -- it's logged with the edit.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await editSupplierInvoice({
        invoiceId,
        invoiceNumber: form.invoiceNumber,
        description: form.description,
        amount: parsedAmount,
        reason: form.reason,
        auditorCode: requireAuditorCode ? form.auditorCode : undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
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
      {requireAuditorCode && (
        <TextInput
          type="password"
          inputMode="numeric"
          label="Financial auditor's code — required to confirm a change to an already printed/paid check"
          value={form.auditorCode}
          onChange={(e) => setForm((f) => ({ ...f, auditorCode: e.target.value }))}
          className="max-w-[140px]"
          placeholder="4-digit code"
        />
      )}
      {error && <Banner tone="danger" title={error} />}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" size="sm" loading={isPending} onClick={handleSave}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
