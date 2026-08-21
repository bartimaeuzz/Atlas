"use client";

import { useState, useTransition } from "react";
import { saveDailyReconciliationDraft, finalizePettyCashDay } from "@/lib/actions/ledger";
import type { PettyCashDayData } from "@/lib/ledger/loadPettyCashDay";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TextInput } from "@/components/ui/Field";
import { formatMoney } from "./formatMoney";
import { formatDateTime } from "@/lib/formatDateTime";

/** The "opening manager counts the drawer against what the closing
 * manager handed over" ritual Oliver described, digitized. Sales cash /
 * Tip cash are read-only here -- they come straight from that day's
 * finalized shifts (see loadPettyCashDay.ts), never typed in twice.
 * Finalizing is blocked until every shift for the day is itself
 * finalized (`data.shiftsReady`) and a physical count has been entered --
 * Oliver's own words: "you supposed not to close daily expenses without
 * knowing what cash we would get from register anyway."
 *
 * 2026-08-14: added `isAdmin` -- an ADMIN-role account can still edit a
 * FINALIZED day's fields ("let use admin as authorized to edit passed
 * day or finalized item"). This does NOT unfinalize the day or bring
 * back the "Finalize day" button -- it just lets Save persist changes to
 * the still-finalized record. `lib/actions/ledger.ts` enforces the same
 * rule server-side; this prop only controls what the UI shows/allows. */
export function ReconciliationPanel({ data, isAdmin }: { data: PettyCashDayData; isAdmin: boolean }) {
  const finalized = data.status === "finalized";
  const locked = finalized && !isAdmin;
  const [beginningBalance, setBeginningBalance] = useState(
    data.reconciliationId ? data.beginningBalance : (data.suggestedBeginningBalance ?? 0)
  );
  const [otherCash, setOtherCash] = useState(data.otherCash);
  const [countedAmount, setCountedAmount] = useState<string>(data.countedAmount != null ? String(data.countedAmount) : "");
  const [note, setNote] = useState(data.note ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalCashIn = data.cashSales + data.cashTip + otherCash;
  const expectedTotalBalance = beginningBalance + totalCashIn - data.totalPettyCashOut;
  const countedNum = countedAmount === "" ? null : Number(countedAmount);
  const diff = countedNum != null && Number.isFinite(countedNum) ? countedNum - expectedTotalBalance : null;
  const matches = diff != null && Math.abs(diff) < 0.01;

  function handleSaveDraft() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveDailyReconciliationDraft(data.date, beginningBalance, otherCash, countedNum, note || null);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function handleFinalize() {
    setError(null);
    if (countedNum == null || !Number.isFinite(countedNum)) {
      setError("Enter the counted cash amount first.");
      return;
    }
    startTransition(async () => {
      try {
        await finalizePettyCashDay(data.date, countedNum, note || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't finalize.");
      }
    });
  }

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-[var(--ink-900)] mb-3">Cash drawer reconciliation</h2>

      {finalized && (
        <div className="mb-3">
          <Banner
            tone="success"
            title="Finalized"
            description={`${data.finalizedAt ? formatDateTime(data.finalizedAt) : ""}${data.finalizedByName ? ` by ${data.finalizedByName}` : ""}`}
          />
        </div>
      )}
      {!data.shiftsReady && !locked && (
        <div className="mb-3">
          <Banner
            tone="warning"
            title="Today's shift(s) aren't finalized yet"
            description="Cash sales/tip figures below won't be final, and this day can't be finalized until they are."
          />
        </div>
      )}

      <div className="space-y-3 text-sm">
        <Field label="Beginning balance" value={beginningBalance} onChange={setBeginningBalance} editable={!locked} />
        <ReadOnlyField label="Sales cash (from today's finalized shifts)" value={data.cashSales} />
        <ReadOnlyField label="Tip cash (from today's finalized shifts)" value={data.cashTip} />
        <Field label="Other" value={otherCash} onChange={setOtherCash} editable={!locked} />
        <ReadOnlyField label="Total cash in" value={totalCashIn} bold />
        <ReadOnlyField label="Petty cash paid out today" value={-data.totalPettyCashOut} />
        <ReadOnlyField label="Expected total balance" value={expectedTotalBalance} bold />

        <TextInput
          type="number"
          label="Counted amount (physical count)"
          step="0.01"
          inputMode="decimal"
          value={countedAmount}
          onChange={(e) => setCountedAmount(e.target.value)}
          disabled={locked}
          placeholder="0.00"
        />

        {countedNum != null && Number.isFinite(countedNum) && (
          <Banner
            tone={matches ? "success" : "danger"}
            title={matches ? "Matches the expected total." : `Off by ${formatMoney(Math.abs(diff!))} ${diff! > 0 ? "over" : "short"}.`}
          />
        )}

        <label className="block">
          <span className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
            rows={2}
            className="w-full border border-[var(--border-strong)] rounded-[var(--radius-md)] px-3 py-2.5 text-base bg-[var(--card)] text-[var(--ink-900)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-border)] focus:border-[var(--primary)] disabled:bg-[var(--paper)] disabled:text-[var(--ink-500)]"
          />
        </label>
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="danger" title="Couldn't save" description={error} />
        </div>
      )}
      {saved && !error && (
        <div className="mt-3">
          <Banner tone="success" title="Saved." />
        </div>
      )}

      {!locked && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" loading={isPending} onClick={handleSaveDraft}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            {!finalized && (
              <Button
                type="button"
                variant="brand"
                disabled={isPending || !data.shiftsReady}
                onClick={handleFinalize}
                title={!data.shiftsReady ? "Finish finalizing today's shift(s) first" : undefined}
              >
                Finalize day
              </Button>
            )}
          </div>
          {/* 2026-08-18 visual-audit fix: the disabled reason used to live
           * only in a hover title=, invisible on touch. Always-visible
           * caption instead -- error prevention shouldn't depend on
           * whether the input device supports hover. title= kept as a
           * free desktop-hover bonus. */}
          {!finalized && !data.shiftsReady && (
            <p className="text-xs text-[var(--ink-500)] mt-1.5">Finish finalizing today&apos;s shift(s) first.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  editable,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  editable: boolean;
}) {
  return (
    <TextInput
      type="number"
      label={label}
      step="0.01"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={!editable}
    />
  );
}

function ReadOnlyField({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  // 2026-08-21 visual-audit fix: this is the app's own documented
  // money-format rule ("negatives shown as red text with a minus sign",
  // project_atlas_ui_design.md) -- was previously always neutral ink
  // regardless of sign. Payroll's Deduction column (page.tsx) already
  // got this right; this component hadn't. Bold/negative both apply
  // (e.g. a negative "Expected total balance" is both bold AND a real
  // problem), negative wins over the plain "bold" ink-900 default.
  const negative = value < 0;
  const colorClass = negative ? "text-[var(--danger-700)]" : bold ? "text-[var(--ink-900)]" : "text-[var(--ink-700)]";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--ink-500)]">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${colorClass}`}>{formatMoney(value)}</span>
    </div>
  );
}
