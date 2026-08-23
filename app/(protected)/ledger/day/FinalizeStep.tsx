"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveDailyCount, finalizePettyCashDay } from "@/lib/actions/ledger";
import type { PettyCashDayData } from "@/lib/ledger/loadPettyCashDay";
import { Card, Button, Banner, TextInput } from "@/components/ui";
import { formatMoney } from "../formatMoney";
import { stepHref } from "./StepNav";

/** Step 3 — count the drawer, read the summary, close the day.
 *
 * This is the ONLY step that can finalize (Oliver, 2026-08-22): you cannot
 * close a day without having seen its summary. The summary is built from
 * persisted values rather than from anything held in this component, so it
 * shows what is actually recorded — not what someone typed and did not save.
 *
 * The drawer breakdown sits behind a disclosure. On a day that balances,
 * nobody needs to see the arithmetic; on a day that does not, it is one tap
 * away and the banner has already said so.
 */
export function FinalizeStep({ data, seen, locked }: { data: PettyCashDayData; seen: number; locked: boolean }) {
  const router = useRouter();
  const [countedAmount, setCountedAmount] = useState<string>(
    data.countedAmount != null ? String(data.countedAmount) : ""
  );
  const [note, setNote] = useState(data.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isPending, startTransition] = useTransition();

  const counted = countedAmount === "" ? null : Number(countedAmount);
  const hasCount = counted != null && Number.isFinite(counted);
  const diff = hasCount ? counted - data.expectedTotalBalance : null;
  const matches = diff != null && Math.abs(diff) < 0.01;
  const finalized = data.status === "finalized";

  function run(fn: () => Promise<void>) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Nothing was changed — try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {finalized && (
        <Banner
          tone="success"
          title="This day is finalized."
          description={data.finalizedByName ? `Closed by ${data.finalizedByName}.` : undefined}
        />
      )}

      <Card>
        <TextInput
          label="What you counted"
          type="number"
          step="0.01"
          inputMode="decimal"
          value={countedAmount}
          disabled={locked}
          onChange={(e) => setCountedAmount(e.target.value)}
          placeholder="0.00"
          hint="The physical count of the drawer, right now."
        />
      </Card>

      {hasCount && (
        <Banner
          tone={matches ? "success" : "danger"}
          title={
            matches
              ? "Matches the expected total."
              : `Off by ${formatMoney(Math.abs(diff!))} ${diff! > 0 ? "over" : "short"}.`
          }
          description={matches ? undefined : "Leave a note below saying what you think happened."}
        />
      )}

      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-500)] mb-2">Day summary</h3>
        <Card>
          <SummaryRow label="Drawer at open" value={data.beginningBalance} />
          <SummaryRow label={`Cash in${data.cashSales + data.cashTip > 0 ? " · sales and tips" : ""}`} value={data.cashSales + data.cashTip} />
          {Math.abs(data.otherCash) > 0.005 && (
            <SummaryRow
              label={data.otherCashReason ? `Added · ${data.otherCashReason}` : "Added"}
              value={data.otherCash}
            />
          )}
          <SummaryRow
            label={
              data.entries.length === 0
                ? "No expenses logged today"
                : `Paid out · ${data.entries.length} expense${data.entries.length === 1 ? "" : "s"}`
            }
            value={-data.totalPettyCashOut}
            negative={data.totalPettyCashOut > 0}
          />
          <SummaryRow label="Expected in drawer" value={data.expectedTotalBalance} strong />
          {hasCount && <SummaryRow label="You counted" value={counted} strong />}
        </Card>
      </div>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        className="flex items-center justify-between w-full min-h-11 px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm font-semibold text-[var(--ink-900)]"
      >
        <span>Cash drawer detail</span>
        <span className="text-xs font-normal text-[var(--ink-500)]">{showDetail ? "Hide" : "Show"}</span>
      </button>
      {showDetail && (
        <Card>
          <SummaryRow label="Cash from sales" value={data.cashSales} />
          <SummaryRow label="Cash tips" value={data.cashTip} />
          <SummaryRow label="Anything else added" value={data.otherCash} />
          <SummaryRow label="Total cash in" value={data.totalCashIn} strong />
        </Card>
      )}

      <TextInput
        label="Note"
        type="text"
        value={note}
        disabled={locked}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything the next manager should know"
      />

      {error && <Banner tone="danger" title={error} />}
      {saved && <Banner tone="success" title="Saved." />}

      {!locked && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => router.push(stepHref(data.date, 2, seen))}
            disabled={isPending}
          >
            Back
          </Button>
          <Button
            variant="secondary"
            loading={isPending}
            onClick={() =>
              run(async () => {
                // Only this step's own fields — see saveDailyCount's comment
                // for why sending the cash fields from here would be a bug.
                await saveDailyCount(data.date, counted, note || null);
                setSaved(true);
              })
            }
          >
            Save
          </Button>
          {!finalized && (
            <Button
              variant="brand"
              className="flex-1"
              loading={isPending}
              disabled={!hasCount || !data.shiftsReady || data.reconciliationId == null}
              onClick={() => run(async () => { await finalizePettyCashDay(data.date, counted!, note || null); })}
            >
              Finalize day
            </Button>
          )}
        </div>
      )}
      {!locked && !finalized && (!hasCount || !data.shiftsReady || data.reconciliationId == null) && (
        <p className="text-xs text-[var(--ink-500)]">
          {!data.shiftsReady
            ? "Finalize today's shifts first — cash sales and tips aren't final until they are."
            : data.reconciliationId == null
              ? "Save the cash step first, so the day doesn't lock against a drawer balance nobody entered."
              : "Enter the counted amount to finalize."}
        </p>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong,
  negative,
}: {
  label: string;
  value: number;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm border-b border-dashed border-[var(--border)] last:border-0">
      <span className={strong ? "font-semibold text-[var(--ink-900)]" : "text-[var(--ink-500)]"}>{label}</span>
      <span
        className={
          "tabular-nums shrink-0 " +
          (negative
            ? "text-[var(--danger-700)]"
            : strong
              ? "font-semibold text-[var(--ink-900)]"
              : "text-[var(--ink-700)]")
        }
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}
