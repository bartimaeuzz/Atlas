"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { issueInstantCheck, type InstantCheckActionState } from "@/lib/actions/supplierCheck";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Select, TextInput } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { formatMoney } from "../formatMoney";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: InstantCheckActionState = { error: null };

/** Door 2 of the 2026-08-31 lifecycle rebuild — Oliver's scenario: the
 * plumber / hood cleaner finishes the job and wants a check before
 * leaving, and no second person is around. One person logs the invoice
 * AND issues the check in a single act. It can't be prevented, so it is
 * made VISIBLE instead: a typed why-now reason, a permanent
 * single-person badge on the check, and a separate listing the approver
 * reviews after the fact. Above the Settings ceiling, the form asks for
 * a second person's PIN — someone who can approve checks, not the actor
 * (the server verifies both halves independently). */
export function InstantCheckButton({
  vendors,
  categories,
  ceiling,
}: {
  vendors: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  ceiling: number;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  // Fully controlled on purpose: React 19 RESETS uncontrolled fields
  // after a form action completes, so a server-side refusal (e.g. the
  // missing second PIN) would wipe everything the manager just typed —
  // measured live 2026-08-31. Controlled state survives the error
  // re-render, which is the whole point of returning an error instead
  // of throwing.
  const [form, setForm] = useState({ vendorId: "", categoryId: "", invoiceNumber: "", description: "", amount: "", instantReason: "", secondPin: "" });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  /** Same, for MoneyField — it hands back the plain string rather than
   * an event, because the comma it displays must never reach state. */
  const setValue = (k: keyof typeof form) => (next: string) => setForm((f) => ({ ...f, [k]: next }));
  const [state, formAction, isPending] = useActionState(issueInstantCheck, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  const overCeiling = Number(form.amount) > ceiling;

  // A successful issue navigates straight to the check download —
  // paymentId only arrives on success, and the navigation itself
  // dismisses the modal (no setState in the effect; the lint rule
  // rightly rejects synchronous setState there).
  useEffect(() => {
    if (state.paymentId) {
      window.location.href = `/ledger/supplier-check/export?paymentIds=${state.paymentId}`;
    }
  }, [state.paymentId]);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Instant check
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} width={448} labelledBy={titleId}>
        <h3 id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-1">
          Issue a check right now
        </h3>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          For a vendor standing here waiting — this skips the weekly review, so it&apos;s permanently
          marked as issued by one person and listed for the approver to see afterwards.
        </p>
        <form ref={formRef} action={formAction} className="space-y-2">
          {state.error && <Banner tone="danger" title="Couldn't issue the check" description={state.error} />}
          <div className="grid grid-cols-2 gap-2">
            <Select name="vendorId" label="Vendor" required value={form.vendorId} onChange={set("vendorId")}>
              <option value="">Choose…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
            <Select name="categoryId" label="Category" required value={form.categoryId} onChange={set("categoryId")}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <TextInput type="text" name="invoiceNumber" label="Invoice / receipt number" required placeholder="e.g. 4471" value={form.invoiceNumber} onChange={set("invoiceNumber")} />
          <TextInput type="text" name="description" label="What was the work? (optional)" placeholder="e.g. hood cleaning" value={form.description} onChange={set("description")} />
          <MoneyField
            name="amount"
            label="Amount"
            required
            placeholder="0.00"
            value={form.amount}
            onValueChange={setValue("amount")}
          />
          <TextInput
            type="text"
            name="instantReason"
            label="Why can't this wait for the weekly batch? — goes on the permanent record"
            required
            placeholder="e.g. plumber requires payment on completion"
            value={form.instantReason}
            onChange={set("instantReason")}
          />
          {overCeiling && (
            <div className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] p-2.5">
              <p className="text-xs text-[var(--ink-700)] mb-1.5">
                Over the {formatMoney(ceiling)} single-person ceiling — a second person who can approve
                checks enters their PIN here.
              </p>
              <TextInput
                type="password"
                inputMode="numeric"
                name="secondPin"
                label="Second person's PIN"
                className="max-w-[160px]"
                placeholder="their PIN"
                value={form.secondPin}
                onChange={set("secondPin")}
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={isPending}>
              {isPending ? "Issuing…" : "Issue check"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
