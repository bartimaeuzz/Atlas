"use client";

import { useState, useTransition } from "react";
import { reconcileStatementPeriod } from "@/lib/actions/card";

/** Target-vs-logged comparison + the "Mark reconciled" button, blocked
 * server-side (and disabled here) until the logged transactions sum to
 * the statement's own total -- confirmed with Oliver this should be a
 * forced match, same discipline as Petty Cash's drawer-count check. */
export function ReconcilePanel({
  periodId,
  loggedTotal,
  statementTotal,
  matches,
  reconciled,
}: {
  periodId: number;
  loggedTotal: number;
  statementTotal: number;
  matches: boolean;
  reconciled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const diff = loggedTotal - statementTotal;

  return (
    <div className="border rounded p-4">
      <h2 className="font-medium mb-3">Reconciliation</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Logged transactions</span>
          <span className="font-medium tabular-nums">${loggedTotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Statement total</span>
          <span className="font-medium tabular-nums">${statementTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className={"text-xs rounded p-2 mt-3 " + (matches ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>
        {matches ? "Matches the statement total." : `Off by $${Math.abs(diff).toFixed(2)} ${diff > 0 ? "over" : "short"}.`}
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {reconciled ? (
        <div className="mt-4 text-xs bg-green-50 text-green-800 border border-green-200 rounded p-2">
          This statement period is reconciled.
        </div>
      ) : (
        <button
          type="button"
          disabled={isPending || !matches}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await reconcileStatementPeriod(periodId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't reconcile.");
              }
            });
          }}
          title={!matches ? "Logged transactions must match the statement total first" : undefined}
          className="w-full mt-4 bg-black text-white px-4 py-2.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Reconciling…" : "Mark reconciled"}
        </button>
      )}
    </div>
  );
}
