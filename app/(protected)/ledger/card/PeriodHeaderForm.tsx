"use client";

import { useState, useTransition } from "react";
import { editStatementPeriod } from "@/lib/actions/card";

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
      <div className="border rounded p-3 mb-4 flex items-center justify-between text-sm">
        <div>
          <div className="text-neutral-500 text-xs">Statement period</div>
          <div className="font-medium">
            {periodStart} to {periodEnd} · ${statementTotal.toFixed(2)} total
          </div>
        </div>
        {editable && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-neutral-500 hover:text-black underline">
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded p-3 mb-4 bg-neutral-50 space-y-2 text-sm">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-neutral-500 mb-1 text-xs">Statement start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-2 py-2 text-sm w-full" />
        </label>
        <label className="block">
          <span className="block text-neutral-500 mb-1 text-xs">Statement end</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-2 py-2 text-sm w-full" />
        </label>
      </div>
      <label className="block">
        <span className="block text-neutral-500 mb-1 text-xs">Statement total</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          inputMode="decimal"
          className="border rounded px-2 py-2 text-sm w-full"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
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
          className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500 hover:text-black">
          Cancel
        </button>
      </div>
    </div>
  );
}
