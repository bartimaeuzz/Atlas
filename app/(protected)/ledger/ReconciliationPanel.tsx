"use client";

import { useState, useTransition } from "react";
import { saveDailyReconciliationDraft, finalizePettyCashDay } from "@/lib/actions/ledger";
import type { PettyCashDayData } from "@/lib/ledger/loadPettyCashDay";

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
    <div className="border rounded p-4">
      <h2 className="font-medium mb-3">Cash drawer reconciliation</h2>

      {finalized && (
        <div className="mb-3 text-xs bg-green-50 text-green-800 border border-green-200 rounded p-2">
          Finalized {data.finalizedAt ? new Date(data.finalizedAt).toLocaleString() : ""}
          {data.finalizedByName ? ` by ${data.finalizedByName}` : ""}
        </div>
      )}
      {!data.shiftsReady && !locked && (
        <div className="mb-3 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded p-2">
          Today&apos;s shift(s) aren&apos;t finalized yet — cash sales/tip figures below won&apos;t be final, and this day
          can&apos;t be finalized until they are.
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

        <label className="block">
          <span className="block text-neutral-500 mb-1">Counted amount (physical count)</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={countedAmount}
            onChange={(e) => setCountedAmount(e.target.value)}
            disabled={locked}
            placeholder="0.00"
            className="border rounded px-3 py-2 text-sm w-full disabled:bg-neutral-100"
          />
        </label>

        {countedNum != null && Number.isFinite(countedNum) && (
          <div className={"text-xs rounded p-2 " + (matches ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700")}>
            {matches ? "Matches the expected total." : `Off by $${Math.abs(diff!).toFixed(2)} ${diff! > 0 ? "over" : "short"}.`}
          </div>
        )}

        <label className="block">
          <span className="block text-neutral-500 mb-1">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
            rows={2}
            className="border rounded px-3 py-2 text-sm w-full disabled:bg-neutral-100"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700 mt-3">Saved.</p>}

      {!locked && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSaveDraft}
              className="border px-4 py-2 rounded text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            {!finalized && (
              <button
                type="button"
                disabled={isPending || !data.shiftsReady}
                onClick={handleFinalize}
                className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
                title={!data.shiftsReady ? "Finish finalizing today's shift(s) first" : undefined}
              >
                Finalize day
              </button>
            )}
          </div>
          {/* 2026-08-18 visual-audit fix: the disabled reason used to live
           * only in a hover title=, invisible on touch. Always-visible
           * caption instead -- error prevention shouldn't depend on
           * whether the input device supports hover. title= kept as a
           * free desktop-hover bonus. */}
          {!finalized && !data.shiftsReady && (
            <p className="text-xs text-neutral-500 mt-1.5">Finish finalizing today&apos;s shift(s) first.</p>
          )}
        </div>
      )}
    </div>
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
    <label className="block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={!editable}
        className="border rounded px-3 py-2 text-sm w-full disabled:bg-neutral-100"
      />
    </label>
  );
}

function ReadOnlyField({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={bold ? "font-semibold" : ""}>${value.toFixed(2)}</span>
    </div>
  );
}
