"use client";

import { useState, useTransition } from "react";
import { reconcileStatementPeriod } from "@/lib/actions/card";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { formatMoney } from "../formatMoney";

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
    <Card>
      <h2 className="text-[15px] font-semibold text-[var(--ink-900)] mb-3">Reconciliation</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-500)]">Logged transactions</span>
          <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(loggedTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-500)]">Statement total</span>
          <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(statementTotal)}</span>
        </div>
      </div>

      <div className="mt-3">
        <Banner
          tone={matches ? "success" : "danger"}
          title={matches ? "Matches the statement total." : `Off by ${formatMoney(Math.abs(diff))} ${diff > 0 ? "over" : "short"}.`}
        />
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="danger" title="Couldn't reconcile" description={error} />
        </div>
      )}

      {reconciled ? (
        <div className="mt-4">
          <Banner tone="success" title="This statement period is reconciled." />
        </div>
      ) : (
        <div className="mt-4">
          <Button
            type="button"
            variant="brand"
            disabled={isPending || !matches}
            loading={isPending}
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
            className="w-full"
          >
            {isPending ? "Reconciling…" : "Mark reconciled"}
          </Button>
          {/* 2026-08-19 retrofit: was hover-title-only, invisible on touch --
           * same fix already applied to ReconciliationPanel.tsx's Finalize
           * button and PrintChecksButton.tsx's disabled state. */}
          {!matches && (
            <p className="text-xs text-[var(--ink-500)] mt-1.5">Logged transactions must match the statement total first.</p>
          )}
        </div>
      )}
    </Card>
  );
}
