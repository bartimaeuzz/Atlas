"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editSupplierInvoice } from "@/lib/actions/supplierCheck";

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
    <div className="border rounded p-2.5 bg-white space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-neutral-500 mb-0.5">Invoice #</span>
          <input
            type="text"
            value={form.invoiceNumber}
            onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
            className="border rounded px-2 py-1 w-full"
          />
        </label>
        <label className="block">
          <span className="block text-neutral-500 mb-0.5">Amount</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="border rounded px-2 py-1 w-full"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-neutral-500 mb-0.5">Description</span>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="border rounded px-2 py-1 w-full"
        />
      </label>
      <label className="block">
        <span className="block text-neutral-500 mb-0.5">Reason for this change — logged with the edit</span>
        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          placeholder="e.g. amount was a typo, should be $45 not $54"
          className="border rounded px-2 py-1 w-full"
        />
      </label>
      {requireAuditorCode && (
        <label className="block">
          <span className="block text-neutral-500 mb-0.5">
            Financial auditor&apos;s code — required to confirm a change to an already printed/paid check
          </span>
          <input
            type="password"
            inputMode="numeric"
            value={form.auditorCode}
            onChange={(e) => setForm((f) => ({ ...f, auditorCode: e.target.value }))}
            className="border rounded px-2 py-1 w-full max-w-[120px]"
            placeholder="4-digit code"
          />
        </label>
      )}
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="text-neutral-500 hover:text-black px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}
