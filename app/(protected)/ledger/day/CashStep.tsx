"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDailyReconciliationDraft } from "@/lib/actions/ledger";
import type { PettyCashDayData } from "@/lib/ledger/loadPettyCashDay";
import { Card, Button, Banner, TextInput } from "@/components/ui";
import { formatMoney } from "../formatMoney";
import { stepHref } from "./StepNav";
import { requiresOtherCashReason } from "@/lib/ledger/otherCashRule";

/** Step 2 — the cash side of the drawer.
 *
 * Split into two blocks on purpose: what the manager is responsible for
 * typing, and what the app already knows from finalized shifts. Before the
 * 2026-08-22 restructure these sat in one undifferentiated column, so it
 * was not obvious which numbers were yours to get right.
 *
 * Pressing Next SAVES before navigating. Step 3 renders the expected
 * balance from persisted data, so if these numbers only lived in component
 * state they would be gone by the time they were needed — and a manager who
 * refreshed mid-flow would silently lose them.
 */
export function CashStep({ data, seen, locked }: { data: PettyCashDayData; seen: number; locked: boolean }) {
  const router = useRouter();
  const [beginningBalance, setBeginningBalance] = useState(
    data.reconciliationId ? data.beginningBalance : (data.suggestedBeginningBalance ?? 0)
  );
  const [otherCash, setOtherCash] = useState(data.otherCash);
  const [reason, setReason] = useState(data.otherCashReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const needsReason = requiresOtherCashReason(otherCash);
  const totalCashIn = data.cashSales + data.cashTip + otherCash;

  function save(then?: () => void) {
    setError(null);
    setSaved(false);
    if (needsReason && !reason.trim()) {
      setError("Say where the added cash came from.");
      return;
    }
    startTransition(async () => {
      try {
        await saveDailyReconciliationDraft(
          data.date,
          beginningBalance,
          otherCash,
          data.countedAmount,
          data.note,
          reason.trim() || null
        );
        if (then) then();
        else setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Nothing was changed — try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-3">
          <TextInput
            label="Cash in the drawer at open"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={beginningBalance}
            disabled={locked}
            onChange={(e) => setBeginningBalance(Number(e.target.value))}
            hint={
              data.reconciliationId
                ? undefined
                : "Carried over from yesterday's closing count. Change it if the drawer actually held something different."
            }
          />
          <TextInput
            label="Anything else added"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={otherCash}
            disabled={locked}
            onChange={(e) => setOtherCash(Number(e.target.value))}
          />
          {needsReason && (
            <TextInput
              label="Where it came from"
              required
              type="text"
              value={reason}
              disabled={locked}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. top-up from BofA account"
              hint="Money appearing in the drawer needs a reason — that is what this page is for."
            />
          )}
        </div>
      </Card>

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-500)] mb-2">
          Comes from finalized shifts
        </h3>
        <Card>
          <ReadOnlyRow label="Cash from sales" value={data.cashSales} />
          <ReadOnlyRow label="Cash tips" value={data.cashTip} />
          <ReadOnlyRow label="Total cash in" value={totalCashIn} strong />
        </Card>
      </div>

      {!data.shiftsReady && (
        <Banner
          tone="warning"
          title="Some of today's shifts aren't finalized yet."
          description="Their cash isn't counted here until they are, and the day can't be finalized."
        />
      )}

      {error && <Banner tone="danger" title={error} />}
      {saved && <Banner tone="success" title="Saved." />}

      {!locked && (
        <>
          {/* Phone: save happens on the way to the next step. */}
          <div className="flex gap-2 lg:hidden">
            <Button variant="secondary" onClick={() => router.push(stepHref(data.date, 1, seen))} disabled={isPending}>
              Back
            </Button>
            <Button
              className="flex-1"
              loading={isPending}
              onClick={() => save(() => router.push(stepHref(data.date, 3, Math.max(seen, 3))))}
            >
              Next: finalize
            </Button>
          </div>
          {/* Desktop: there is no "next", so this step needs its own save.
              Without it a desktop user could type a drawer balance with no
              way to record it. */}
          <div className="hidden lg:flex">
            <Button variant="secondary" loading={isPending} onClick={() => save()}>
              Save cash
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ReadOnlyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-dashed border-[var(--border)] last:border-0">
      <span className={strong ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-500)]"}>{label}</span>
      <span className={"tabular-nums " + (strong ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-700)]")}>
        {formatMoney(value)}
      </span>
    </div>
  );
}
