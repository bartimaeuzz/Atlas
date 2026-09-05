"use client";

import { useState, useTransition } from "react";
import { editStatementPeriod } from "@/lib/actions/card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TextInput } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** Read-only display of the period's own dates/target total, with a
 * small "Edit" toggle for the fields that were set when the period was
 * created (in case Aey mistyped the statement total, or a date needs a
 * correction). Locked entirely once the parent page decides `editable`
 * is false. */
export function PeriodHeaderForm({
  periodId,
  periodStart,
  periodEnd,
  statementTotal,
  paymentsCreditsTotal,
  editable,
}: {
  periodId: number;
  periodStart: string;
  periodEnd: string;
  statementTotal: number;
  paymentsCreditsTotal: number;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);
  const [total, setTotal] = useState(String(statementTotal));
  const [creditsTotal, setCreditsTotal] = useState(String(paymentsCreditsTotal));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-[var(--card)] p-3 mb-4 flex items-center justify-between text-sm">
        <div>
          <div className="text-[var(--ink-500)] text-xs">Statement period</div>
          <div className="font-medium text-[var(--ink-900)]">
            {periodStart} to {periodEnd} · {formatMoney(statementTotal)} charges
            {paymentsCreditsTotal !== 0 && ` · ${formatMoney(paymentsCreditsTotal)} payments & credits`}
          </div>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="mb-4 !p-3 space-y-2 text-sm">
      {error && <Banner tone="danger" title="Couldn't save" description={error} />}
      <div className="grid grid-cols-2 gap-2">
        <TextInput type="date" label="Statement start" value={start} onChange={(e) => setStart(e.target.value)} />
        <TextInput type="date" label="Statement end" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <MoneyField
        label="Charges & fees total"
        hint="Purchases + fees + interest, as printed on the statement."
        value={total}
        onValueChange={setTotal}
      />
      <MoneyField
        label="Payments & credits total"
        hint="Bill payments and refunds. Leave 0 if the statement shows none."
        value={creditsTotal}
        onValueChange={setCreditsTotal}
      />
      <div className="flex items-center gap-2">
        {/* Cancel left, primary right -- 2026-08-24 consistency decision. */}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          loading={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              // The action returns its error (thrown Errors get redacted
              // to "Minified React error #441" in production builds).
              const result = await editStatementPeriod(periodId, start, end, Number(total), Number(creditsTotal));
              if (result.error) setError(result.error);
              else setEditing(false);
            });
          }}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
