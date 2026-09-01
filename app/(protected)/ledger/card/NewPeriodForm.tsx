"use client";

import { useActionState } from "react";
import { createStatementPeriod, type CardActionState } from "@/lib/actions/card";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: CardActionState = { error: null };

/** Starts a new statement period: pick the card, the statement's date
 * range, and its two printed summary totals (the reconciliation
 * targets -- charges and payments/credits, two-sided since 2026-08-25;
 * see cardStatementPeriods' schema comment). Once created, transactions
 * get logged against it on the period's own detail page. */
export function NewPeriodForm({ cards }: { cards: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createStatementPeriod, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  return (
    <form ref={formRef} action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2">
      {state.error && <Banner tone="danger" title="Couldn't start period" description={state.error} />}
      <Select name="cardId" label="Card" required>
        <option value="">Choose…</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <TextInput type="date" name="periodStart" label="Statement start" required />
        <TextInput type="date" name="periodEnd" label="Statement end" required />
      </div>
      <p className="text-xs text-[var(--ink-500)]">Copy the dates and both totals from the statement&rsquo;s own summary box.</p>
      <TextInput
        type="number"
        name="statementTotal"
        label="Charges & fees total"
        hint="Purchases + fees + interest, as printed on the statement."
        step="0.01"
        min="0"
        required
        placeholder="0.00"
        inputMode="decimal"
      />
      <TextInput
        type="number"
        name="paymentsCreditsTotal"
        label="Payments & credits total"
        hint="Bill payments and refunds. Leave 0 if the statement shows none."
        step="0.01"
        min="0"
        defaultValue="0"
        inputMode="decimal"
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Starting…" : "Start period"}
      </Button>
    </form>
  );
}
