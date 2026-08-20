"use client";

import { useActionState } from "react";
import { createStatementPeriod, type CardActionState } from "@/lib/actions/card";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: CardActionState = { error: null };

/** Starts a new statement period: pick the card, the statement's date
 * range, and its total charge amount (the reconciliation target). Once
 * created, transactions get logged against it on the period's own
 * detail page. */
export function NewPeriodForm({ cards }: { cards: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(createStatementPeriod, initialState);

  return (
    <form action={formAction} className="border border-[var(--border)] rounded-[var(--radius-lg)] p-3 bg-[var(--paper)] space-y-2">
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
      <TextInput
        type="number"
        name="statementTotal"
        label="Statement total (from the bank statement)"
        step="0.01"
        min="0"
        required
        placeholder="0.00"
        inputMode="decimal"
      />
      <Button type="submit" loading={isPending} className="w-full">
        {isPending ? "Starting…" : "Start period"}
      </Button>
    </form>
  );
}
