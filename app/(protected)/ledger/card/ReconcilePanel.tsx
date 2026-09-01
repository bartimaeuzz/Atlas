"use client";

import { useState, useTransition } from "react";
import { reconcileStatementPeriod } from "@/lib/actions/card";
import { cardSideMatches } from "@/lib/ledger/cardReconcile";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatMoney } from "../formatMoney";

/** Target-vs-logged comparison + the "Mark reconciled" button, blocked
 * server-side (and disabled here) until the logged transactions match
 * the statement -- confirmed with Oliver this should be a forced match,
 * same discipline as Petty Cash's drawer-count check. Two-sided since
 * 2026-08-25 (see lib/ledger/cardReconcile.ts): positive lines must
 * match the statement's charges total AND negative lines its payments &
 * credits total, each side against its own printed number. */
export function ReconcilePanel({
  periodId,
  chargesLogged,
  creditsLogged,
  statementTotal,
  paymentsCreditsTotal,
  reconciled,
  reconciledSinglePerson,
  requireSecondPerson,
}: {
  periodId: number;
  chargesLogged: number;
  creditsLogged: number;
  statementTotal: number;
  paymentsCreditsTotal: number;
  /** True when this period was closed without a second person — see
   * payrollPeriods.singlePerson for why it is recorded and shown. */
  reconciledSinglePerson: boolean;
  /** Settings → Two-person money controls (2026-09-01). When on, closing
   * the period asks a second person who can reconcile to type their PIN. */
  requireSecondPerson: boolean;
  reconciled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [secondPin, setSecondPin] = useState("");

  function runReconcile(pin: string) {
    setError(null);
    startTransition(async () => {
      try {
        // Return-value error -- thrown Errors get redacted to
        // "Minified React error #441" in production builds.
        const result = await reconcileStatementPeriod(periodId, pin);
        if (result.error) setError(result.error);
        else setConfirmOpen(false);
      } catch {
        // Without this the spinner runs forever on a dropped connection —
        // the documented startTransition(async …) strand-the-spinner class.
        setError("Couldn't reach the server — check your connection and try again.");
      } finally {
        setSecondPin("");
      }
    });
  }

  const chargesMatch = cardSideMatches(chargesLogged, statementTotal);
  const creditsMatch = cardSideMatches(creditsLogged, paymentsCreditsTotal);
  const matches = chargesMatch && creditsMatch;
  // The payments side only takes up space when it has something to say --
  // most periods have no payments/refunds, and a 0-vs-0 row is noise.
  const showCredits = creditsLogged !== 0 || paymentsCreditsTotal !== 0;

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-[var(--ink-900)] mb-3">Reconciliation</h2>
      <div className="space-y-2 text-sm">
        <SideRow label="Charges logged" logged={chargesLogged} target={statementTotal} targetLabel="Charges & fees total" match={chargesMatch} />
        {showCredits && (
          <SideRow
            label="Payments & credits logged"
            logged={creditsLogged}
            target={paymentsCreditsTotal}
            targetLabel="Payments & credits total"
            match={creditsMatch}
          />
        )}
      </div>

      <div className="mt-3">
        <Banner
          tone={matches ? "success" : "danger"}
          title={
            matches
              ? "Matches the statement."
              : !chargesMatch && (!creditsMatch && showCredits)
                ? "Neither side matches the statement yet."
                : !chargesMatch
                  ? `Charges off by ${offBy(chargesLogged, statementTotal)}.`
                  : `Payments & credits off by ${offBy(creditsLogged, paymentsCreditsTotal)} — record the missing payment with "+ Add transaction", entered as a negative amount.`
          }
        />
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="danger" title="Couldn't reconcile" description={error} />
        </div>
      )}

      {reconciled ? (
        <div className="mt-4">
          <Banner
            tone="success"
            title="This statement period is reconciled."
            description={reconciledSinglePerson ? "Closed by one person." : undefined}
          />
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
              // With the two-person control on, closing the period needs a
              // colleague's PIN, so it goes through the dialog. With it off
              // the button stays one click, as it has always been.
              if (requireSecondPerson) {
                setConfirmOpen(true);
                return;
              }
              runReconcile("");
            }}
            className="w-full"
          >
            {isPending ? "Reconciling…" : "Mark reconciled"}
          </Button>
          {/* 2026-08-19 retrofit: was hover-title-only, invisible on touch --
           * same fix already applied to ReconciliationPanel.tsx's Finalize
           * button and PrintChecksButton.tsx's disabled state. */}
          {!matches && (
            <p className="text-xs text-[var(--ink-500)] mt-1.5">Both sides must match the statement&rsquo;s printed totals first.</p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setSecondPin("");
        }}
        title="Close this statement period?"
        description="Reconciling locks the period against the bank statement. It stops being editable."
        confirmLabel="Mark reconciled"
        loading={isPending}
        confirmDisabled={secondPin.trim() === ""}
        body={
          <label className="block text-sm">
            <span className="block text-[var(--ink-700)] mb-1.5">Second person&apos;s PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={secondPin}
              onChange={(e) => setSecondPin(e.target.value)}
              className="w-full border border-[var(--border-strong)] rounded-[var(--radius-md)] px-3 py-2.5 text-base min-h-11 tracking-[0.3em] text-center"
            />
            <span className="block text-xs text-[var(--ink-500)] mt-1.5">
              Anyone else who can reconcile the card — it just cannot be you.
            </span>
          </label>
        }
        onConfirm={() => runReconcile(secondPin)}
      />
    </Card>
  );
}

function offBy(logged: number, target: number): string {
  const diff = logged - target;
  return `${formatMoney(Math.abs(diff))} ${diff > 0 ? "over" : "short"}`;
}

/** One side's logged-vs-target pair. The word (not colour alone) carries
 * the state -- same rule as the shifts list's status cards. */
function SideRow({
  label,
  logged,
  target,
  targetLabel,
  match,
}: {
  label: string;
  logged: number;
  target: number;
  targetLabel: string;
  match: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[var(--ink-500)]">{label}</span>
        <span className={"font-medium tabular-nums " + (match ? "text-[var(--ink-900)]" : "text-[var(--warning-700)]")}>
          {formatMoney(logged)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[var(--ink-500)]">{targetLabel}</span>
        <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(target)}</span>
      </div>
    </>
  );
}
