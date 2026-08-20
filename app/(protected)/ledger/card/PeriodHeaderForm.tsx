"use client";

import { useState, useTransition } from "react";
import { editStatementPeriod } from "@/lib/actions/card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TextInput } from "@/components/ui/Field";
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
  editable,
}: {
  periodId: number;
  periodStart: string;
  periodEnd: string;
  statementTotal: number;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);
  const [total, setTotal] = useState(String(statementTotal));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="border border-[var(--border)] rounded-[var(--radius-lg)] bg-[var(--card)] p-3 mb-4 flex items-center justify-between text-sm">
        <div>
          <div className="text-[var(--ink-500)] text-xs">Statement period</div>
          <div className="font-medium text-[var(--ink-900)]">
            {periodStart} to {periodEnd} · {formatMoney(statementTotal)} total
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
      <TextInput
        type="number"
        label="Statement total"
        step="0.01"
        min="0"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
        inputMode="decimal"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          loading={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await editStatementPeriod(periodId, start, end, Number(total));
                setEditing(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't save.");
              }
            });
          }}
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
