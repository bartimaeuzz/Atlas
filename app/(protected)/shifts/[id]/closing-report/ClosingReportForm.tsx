"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import {
  saveClosingReportSales, saveClosingReportAndPreview,
  type ClosingReportActionState,
} from "@/lib/actions/shift";
import type { ClosingReportData, PlatformSalesRow as PlatformSalesRowData, PriorShiftFigures } from "@/lib/shift/loadClosingReportData";
import { TOAST_DAY_TOTAL_FIELDS, PLATFORM_DAY_TOTAL_FIELDS } from "@/lib/shift/priorShiftSales";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronDownIcon } from "@/components/ui/icons";
import { Banner } from "@/components/ui/Banner";

const initialState: ClosingReportActionState = { error: null };

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

/* Phone retrofit 2026-08-24. Two shared fragments:

   INPUT -- every field is min-h-11 (44px): this is money entry on a phone
   at closing time, the old py-1 boxes measured 30px tall.

   The three per-employee input tables (wage adjustments, deductions,
   per-person bonus metrics) are now ONE adaptive grid each instead of a
   phone-card + desktop-table pair, because this form posts as a single
   <form> and display:none inputs still submit -- duplicating the inputs
   across two layouts would double-post every field. Phone: each employee
   is a bordered card with labelled fields; lg: the same nodes lay out as
   table-ish rows under a header row that is hidden on phone. */
const INPUT =
  "border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-11 w-full bg-[var(--card)] disabled:bg-[var(--paper)] disabled:text-[var(--ink-500)]";

export function ClosingReportForm({
  shiftId,
  data,
  isFinalized,
}: {
  shiftId: number;
  data: ClosingReportData;
  isFinalized: boolean;
}) {
  const [saveState, saveFormAction, isSaving] = useActionState(saveClosingReportSales, initialState);
  // "Saved ✓" flash after a successful draft save (2026-08-24, Oliver).
  // Derived, not set: justSaved is true while the latest savedAt nonce
  // hasn't been cleared, and the effect's ONLY job is the 2s timer that
  // clears it -- no synchronous setState in the effect body, which the
  // set-state-in-effect lint rule rightly rejects.
  const [clearedSavedAt, setClearedSavedAt] = useState<number | null>(null);
  const justSaved = !!saveState.savedAt && saveState.savedAt !== clearedSavedAt;
  useEffect(() => {
    if (!saveState.savedAt || saveState.savedAt === clearedSavedAt) return;
    const savedAt = saveState.savedAt;
    const t = setTimeout(() => setClearedSavedAt(savedAt), 2000);
    return () => clearTimeout(t);
  }, [saveState.savedAt, clearedSavedAt]);
  const [previewState, previewFormAction, isGoingToPreview] = useActionState(saveClosingReportAndPreview, initialState);
  const error = saveState.error ?? previewState.error;
  const taxRate = data.defaultSalesTaxRate;

  // Live sales-tax auto-calc (2026-08-10, Oliver: "after I enter the net
  // sale, the tax doesn't get auto-calculate") — the loader only computes
  // a suggestion once at PAGE LOAD, which looked broken since typing a new
  // Total sales value did nothing to the Sales tax field until a reload.
  // Fixed by tracking both fields as live state: Sales tax recomputes as
  // Total sales changes, UNLESS the manager has directly edited Sales tax
  // themselves (tracked via taxTouched) — starts true if a real, explicit
  // value was already saved before (salesTaxIsAuto === false), so
  // reopening an already-filled-in report never silently overwrites a
  // prior manual correction.
  // Wage adjustments and disciplinary deductions start COLLAPSED
  // (2026-08-24, Oliver): both are exception paths ("leave blank to
  // change nothing"), so on the everyday close they are two long
  // per-employee lists standing between the manager and Save. Each one
  // opens itself when it already carries saved data -- a collapsed
  // section must never hide money that is actually in effect. The
  // inputs stay in the DOM while collapsed, so the single-form post is
  // unchanged.
  const hasTipBumps = data.pointValueRows.some((r) => r.hasOverride);
  const hasBonusMetrics =
    data.shiftMetricRows.some((r) => r.currentValue !== 0) || data.metricRows.some((r) => r.currentValue !== 0);
  const hasWageAdjustments = data.wageAdjustmentRows.some(
    (r) => r.wageOverrideAmount != null || r.extraPayAmount !== 0 || r.reason
  );
  const hasDeductions = data.wageAdjustmentRows.some((r) => r.deductionAmount !== 0 || r.deductionReason);

  return (
    // Keyed on the save nonce (2026-08-31): after a save, every input —
    // uncontrolled defaultValue fields AND the controlled state inside
    // ToastSalesCard/PlatformSalesRow — remounts from the freshly
    // revalidated server props. Without this, a "whole day" save leaves
    // the fields showing the entered day totals while the database holds
    // the subtracted per-shift figures — a silent screen-vs-DB mismatch,
    // exactly the rendered-only defect class this repo keeps meeting.
    <form key={saveState.savedAt ?? "initial"} className="space-y-4">
      <input type="hidden" name="shiftId" value={shiftId} />

      {error && (
        <div className="border border-[var(--danger-border)] bg-[var(--danger-tint)] text-[var(--danger-700)] rounded-[var(--radius-md)] p-4 text-sm whitespace-pre-line">
          <div className="font-semibold mb-1">Couldn&apos;t save — nothing was recorded.</div>
          {error}
        </div>
      )}

      {/* Each topic is its own Card (2026-08-24, Oliver) -- six sections of
          very different kinds (money entry, per-person bumps, exceptions)
          used to share one undivided column. */}
      <ToastSalesCard s={data.sales} taxRate={taxRate} prior={data.priorShift} isFinalized={isFinalized} />

      <Card>
      {/* Opens itself when someone's point is still undecided (2026-08-29):
          a collapsed section must never hide something that BLOCKS the
          close, for the same reason it must never hide money in effect. */}
      <details open={hasTipBumps || data.undecidedPointCount > 0} className="group">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-lg font-medium text-[var(--ink-900)] min-h-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Tip points
            {data.undecidedPointCount > 0 ? (
              <span className="text-xs font-normal text-[var(--warning-700)]">
                — {data.undecidedPointCount} still to set
              </span>
            ) : (
              hasTipBumps && <span className="text-xs font-normal text-[var(--ink-500)]">— has entries</span>
            )}
          </span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
        <fieldset disabled={isFinalized} className="mt-2">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Bump someone&apos;s point value for today only — e.g. they upsold a ton of drinks, or
          covered for someone. Defaults to their standing value; leave alone to change nothing.
          This does NOT change their permanent record, only this shift.
        </p>
        {data.undecidedPointCount > 0 && (
          <div className="mb-3">
            <Banner
              tone="warning"
              title={
                data.undecidedPointCount === 1
                  ? "One person needs a tip point before you can finalize"
                  : `${data.undecidedPointCount} people need a tip point before you can finalize`
              }
              description="They're working a position they aren't set up for, so there's no standing point to fall back on. Enter what their share should be for today — it won't change their permanent record."
            />
          </div>
        )}
        {data.pointValueRows.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">No tip-pool-eligible staff on the roster yet.</p>
        ) : (
          <TipPointsSection rows={data.pointValueRows} pointWeightedPools={data.pointWeightedPools} />
        )}
        </fieldset>
      </details>
      </Card>

      <Card>
      <details open={hasBonusMetrics} className="group">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-lg font-medium text-[var(--ink-900)] min-h-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Bonus metrics
            {hasBonusMetrics && <span className="text-xs font-normal text-[var(--ink-500)]">— has entries</span>}
          </span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
        <fieldset disabled={isFinalized} className="mt-2">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Restaurant-configurable bonuses — today that&apos;s the host team&apos;s shared
          drink count (paid $ per drink, pulled off the top of Pool 1 before the
          split, then split equally among whoever worked Host — see Preview).
          Adding a new bonus later shows up here automatically, no page changes needed.
        </p>

        {data.shiftMetricRows.length > 0 && (
          <div className="space-y-3 mb-4">
            {data.shiftMetricRows.map((r) => (
              <label key={r.metricDefinitionId} className="text-sm block max-w-xs">
                <span className="block text-[var(--ink-500)] mb-1">{r.metricLabel}</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  name={`metric_shift_${r.metricDefinitionId}`}
                  defaultValue={r.currentValue || ""}
                  placeholder="0"
                  className={INPUT + " max-w-28"}
                />
              </label>
            ))}
          </div>
        )}

        {data.metricRows.length > 0 && (
          <div>
            <div className="hidden lg:grid lg:grid-cols-[1.3fr_1.3fr_1fr] lg:gap-3 text-sm text-[var(--ink-500)] pb-1">
              <span>Employee</span>
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className="space-y-3 lg:space-y-2">
              {data.metricRows.map((r) => (
                <div
                  key={`${r.metricDefinitionId}_${r.employeeId}`}
                  className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] p-3 text-sm lg:grid-cols-[1.3fr_1.3fr_1fr] lg:items-center lg:border-0 lg:p-0"
                >
                  <div className="col-span-2 lg:col-span-1">
                    {r.employeeName}
                    <span className="block text-xs text-[var(--ink-500)]">{r.positionName}</span>
                  </div>
                  <div className="text-[var(--ink-500)] self-center">
                    <span className="lg:hidden text-xs block">Metric</span>
                    {r.metricLabel}
                  </div>
                  <label className="block">
                    <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Value</span>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      name={`metric_emp_${r.metricDefinitionId}_${r.employeeId}`}
                      defaultValue={r.currentValue || ""}
                      placeholder="0"
                      className={INPUT}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.shiftMetricRows.length === 0 && data.metricRows.length === 0 && (
          <p className="text-sm text-[var(--ink-500)]">No bonus-eligible staff on the roster yet.</p>
        )}
        </fieldset>
      </details>
      </Card>

      <Card>
      <details open={hasWageAdjustments} className="group">
        {/* Chevron instead of a "tap to open" sentence (Oliver, 2026-08-24);
            list-none hides the UA disclosure triangle so there is one
            indicator, not two. The chevron flips via group-open. */}
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-lg font-medium text-[var(--ink-900)] min-h-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Wage adjustments
            {hasWageAdjustments && <span className="text-xs font-normal text-[var(--ink-500)]">— has entries</span>}
          </span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
        <fieldset disabled={isFinalized} className="mt-2">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Optional, for shift-coverage situations — e.g. Erika works Host but covers Aey&apos;s
          Bartender shift when Aey calls in sick. &quot;Override&quot; replaces the system&apos;s
          normal wage pick if it&apos;s wrong; &quot;Extra pay&quot; is always added ON TOP and shows
          as its own line in Preview/Summary, separate from the regular wage. Leave both blank to
          change nothing.
        </p>
        {data.wageAdjustmentRows.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">Nobody on the roster yet.</p>
        ) : (
          // Card-table shell with Floor Manager / FOH / BOH section rows
          // (2026-08-25, Oliver: "use consistency header card") -- same
          // grouping and visual language as the roster page's table.
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-[1.3fr_0.7fr_1fr_1fr_1.4fr] lg:gap-3 text-[11px] font-medium text-[var(--ink-500)] px-3 py-2 border-b border-[var(--border)] bg-[var(--card)]">
              <span>Employee</span>
              <span>Auto wage</span>
              <span>Override</span>
              <span>Extra pay</span>
              <span>Reason</span>
            </div>
            {groupWageRows(data.wageAdjustmentRows).map((group) => (
              <div key={group.header}>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] bg-[var(--paper)] border-b border-[var(--border)]">
                  {group.header}
                </div>
                <div className="divide-y divide-[var(--border)] border-b border-[var(--border)] last:border-b-0">
                  {group.rows.map((r) => (
                    <div
                      key={r.employeeId}
                      className="grid grid-cols-2 gap-3 bg-[var(--card)] p-3 text-sm lg:grid-cols-[1.3fr_0.7fr_1fr_1fr_1.4fr] lg:items-center lg:px-3 lg:py-2"
                    >
                      <div className="col-span-2 lg:col-span-1">
                        {r.employeeName}
                        <span className="block text-xs text-[var(--ink-500)]">{r.wageBearingPositionName}</span>
                      </div>
                      <div className="text-[var(--ink-500)] self-center">
                        <span className="lg:hidden text-xs block">Auto wage</span>
                        {r.autoResolvedWage != null ? `$${r.autoResolvedWage.toFixed(2)}` : "—"}
                      </div>
                      <label className="block">
                        <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Override</span>
                        <input
                          type="number"
                          step={0.01}
                          name={`wageOverride_${r.employeeId}`}
                          defaultValue={r.wageOverrideAmount ?? ""}
                          placeholder="auto"
                          className={INPUT}
                        />
                      </label>
                      <label className="block col-span-2 lg:col-span-1">
                        <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Extra pay</span>
                        <input
                          type="number"
                          step={0.01}
                          name={`extraPay_${r.employeeId}`}
                          defaultValue={r.extraPayAmount || ""}
                          placeholder="0"
                          className={INPUT}
                        />
                      </label>
                      <label className="block col-span-2 lg:col-span-1">
                        <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Reason</span>
                        <input
                          type="text"
                          name={`wageReason_${r.employeeId}`}
                          defaultValue={r.reason ?? ""}
                          placeholder="optional note"
                          className={INPUT}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        </fieldset>
      </details>
      </Card>

      <Card>
      <details open={hasDeductions} className="group">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-lg font-medium text-[var(--ink-900)] min-h-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Disciplinary deductions
            {hasDeductions && <span className="text-xs font-normal text-[var(--ink-500)]">— has entries</span>}
          </span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
        <fieldset disabled={isFinalized} className="mt-2">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Optional, for disciplinary/correction issues (late, property damage, etc.) — since wages
          are flat-rate, a deduction can&apos;t come out of hours worked, so it&apos;s a direct dollar
          amount subtracted from that person&apos;s payout. Shown to the employee themselves and
          managers only — never visible to coworkers. Takes effect as soon as you save, same as
          wage adjustments above. Leave blank to change nothing.
        </p>
        {data.wageAdjustmentRows.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">Nobody on the roster yet.</p>
        ) : (
          <div>
            <div className="hidden lg:grid lg:grid-cols-[1.3fr_1fr_1.7fr] lg:gap-3 text-sm text-[var(--ink-500)] pb-1">
              <span>Employee</span>
              <span>Deduction</span>
              <span>Reason</span>
            </div>
            <div className="space-y-3 lg:space-y-2">
              {data.wageAdjustmentRows.map((r) => (
                <div
                  key={r.employeeId}
                  className="grid grid-cols-2 gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] p-3 text-sm lg:grid-cols-[1.3fr_1fr_1.7fr] lg:items-center lg:border-0 lg:p-0"
                >
                  <div className="col-span-2 lg:col-span-1 self-center">{r.employeeName}</div>
                  <label className="block">
                    <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Deduction</span>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      name={`deduction_${r.employeeId}`}
                      defaultValue={r.deductionAmount || ""}
                      placeholder="0"
                      className={INPUT}
                    />
                  </label>
                  <label className="block">
                    <span className="lg:hidden text-xs text-[var(--ink-500)] block mb-1">Reason</span>
                    <input
                      type="text"
                      name={`deductionReason_${r.employeeId}`}
                      defaultValue={r.deductionReason ?? ""}
                      placeholder="e.g. 45 min late"
                      className={INPUT}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
        </fieldset>
      </details>
      </Card>

      <PlatformSalesCard
        platforms={data.platformSales}
        taxRate={taxRate}
        prior={data.priorShift}
        isFinalized={isFinalized}
      />

      <Card>
      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-3">Incident report</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Anything worth remembering about this shift — an incident, a customer complaint, broken
          equipment, why someone was out. Saves with the report, shows on the Preview, and stays on
          the record. Leave blank if the day was uneventful.
        </p>
        <textarea
          name="incidentReport"
          defaultValue={data.shift?.incidentReport ?? ""}
          rows={4}
          placeholder="e.g. Bomb twisted an ankle mid-service — Carlos came in to cover Dinner."
          className={INPUT + " max-w-xl min-h-24"}
        />
      </fieldset>
      </Card>

      {!isFinalized && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Secondary saves the draft, primary moves the flow forward --
              one obviously-correct next action. Both are the design
              system's Button (raw <button>s until 2026-08-24); formAction
              rides through Button's ...rest. */}
          <Button
            type="submit"
            variant="secondary"
            formAction={saveFormAction}
            loading={isSaving}
            disabled={isGoingToPreview}
          >
            {isSaving ? "Saving…" : justSaved ? "Saved ✓" : "Save (draft)"}
          </Button>
          <Button
            type="submit"
            variant="primary"
            formAction={previewFormAction}
            loading={isGoingToPreview}
            disabled={isSaving}
          >
            {isGoingToPreview ? "Saving…" : "Save & view payout →"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Floor Manager leads, then FOH, then BOH -- same grouping rule as the
 * roster page's card table (grouped by name because "Floor Manager" is a
 * position, not a category of its own). */
function groupWageRows(rows: ClosingReportData["wageAdjustmentRows"]) {
  const fm = rows.filter((r) => r.wageBearingPositionName === "Floor Manager");
  const rest = rows.filter((r) => r.wageBearingPositionName !== "Floor Manager");
  return [
    { header: "Floor Manager", rows: fm },
    { header: "FOH — Front of house", rows: rest.filter((r) => r.wageBearingPositionCategory === "FOH") },
    { header: "BOH — Back of house", rows: rest.filter((r) => r.wageBearingPositionCategory === "BOH") },
  ].filter((g) => g.rows.length > 0);
}

const POOL_LABELS: Record<string, string> = {
  POOL_1_DINE_IN: "Pool 1 · Dine-in",
  POOL_2_TAKEOUT_ONLINE: "Pool 2 · Takeout & online",
  POOL_3_DELIVERY: "Pool 3 · Delivery",
};

const POOL_SUFFIX: Record<string, string> = {
  POOL_1_DINE_IN: "p1",
  POOL_2_TAKEOUT_ONLINE: "p2",
  POOL_3_DELIVERY: "p3",
};

/** Tip points as a card table with a field PER POINT-WEIGHTED POOL per
 * row (2026-08-25, Oliver: one point moving a Host's weight in Pool 1
 * AND Pool 2 at once was wrong -- "tip adjustment ควรมีอีก field").
 * Single-pool people see one field, a Host sees one per pool, and
 * equal-split pools get no field at all (a point there would be an
 * inert control that lies). The live per-pool totals underneath update
 * as values change -- a point only means anything relative to the rest
 * of its pool. Inputs are controlled ONLY to feed those sums; the
 * server stores whatever is submitted, per pool. */
function TipPointsSection({
  rows,
  pointWeightedPools,
}: {
  rows: ClosingReportData["pointValueRows"];
  pointWeightedPools: ClosingReportData["pointWeightedPools"];
}) {
  const weighted = new Set<string>(pointWeightedPools);
  const editableRows = rows.filter((r) => r.tipPoolGroups.some((g) => weighted.has(g)));
  // An undecided row starts EMPTY, not pre-filled (2026-08-29). Showing
  // the 1.0 fallback in the box would be the same silent default this gate
  // exists to remove -- it reads as "already handled" and gets saved
  // untouched. Empty is the honest rendering of "nobody has decided this".
  const [points, setPoints] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(
      editableRows.flatMap((r) =>
        r.tipPoolGroups
          .filter((g) => weighted.has(g))
          .map((g) => [`${r.rosterEntryId}:${g}`, r.needsDecision ? "" : r.pointValueByPool[g] ?? 1.0])
      )
    )
  );

  if (editableRows.length === 0) {
    return <p className="text-sm text-[var(--ink-500)]">No point-weighted pools are staffed this shift.</p>;
  }

  const pools = pointWeightedPools.filter((g) => editableRows.some((r) => r.tipPoolGroups.includes(g)));
  const poolTotals = pools.map((pool) => {
    const members = editableRows.filter((r) => r.tipPoolGroups.includes(pool));
    return {
      pool,
      total: members.reduce((sum, r) => {
        const v = points[`${r.rosterEntryId}:${pool}`];
        return sum + (typeof v === "number" ? v : 0);
      }, 0),
      people: members.length,
      // Undecided rows are excluded from the total above, so say so rather
      // than showing a sum that quietly under-counts the pool.
      undecided: members.filter((r) => points[`${r.rosterEntryId}:${pool}`] === "").length,
    };
  });

  // Grouped under position header rows (2026-08-31, Aey: "tip point on
  // closing shift add row header of position. easy for human to scanning
  // through sheet") — she reads this sheet position by position, and a
  // flat list made every row a two-line read to find where Servers end
  // and Hosts start. Order preserved from the roster.
  const positionGroups: { positionName: string; rows: typeof editableRows }[] = [];
  for (const r of editableRows) {
    const last = positionGroups[positionGroups.length - 1];
    if (last && last.positionName === r.positionName) last.rows.push(r);
    else positionGroups.push({ positionName: r.positionName, rows: [r] });
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--card)]">
        <span>Employee</span>
        <span>Points per pool</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {positionGroups.map((group) => (
          <Fragment key={group.positionName}>
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] bg-[var(--paper)]">
              {group.positionName}
            </div>
            {group.rows.map((r) => (
          <div key={r.rosterEntryId} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] gap-2 px-3 py-2 items-center bg-[var(--card)]">
            <div className="text-sm text-[var(--ink-900)]">
              {r.employeeName}
              <span className="block text-xs text-[var(--ink-500)]">{r.positionName}</span>
              {r.needsDecision && (
                <>
                  <span className="block text-xs text-[var(--warning-700)] mt-0.5">
                    Not set up for {r.positionName} — set their point
                  </span>
                  {r.suggestedPoint != null && (
                    <button
                      type="button"
                      onClick={() =>
                        setPoints((p) => {
                          const next = { ...p };
                          for (const g of r.tipPoolGroups) {
                            if (weighted.has(g)) next[`${r.rosterEntryId}:${g}`] = r.suggestedPoint!;
                          }
                          return next;
                        })
                      }
                      // text-left: <button> defaults to text-align:center,
                      // which centred the wrapped label against a
                      // left-aligned column on phone widths.
                      className="mt-1 inline-flex items-center justify-start text-left min-h-11 text-xs text-[var(--primary-700)] underline underline-offset-2"
                    >
                      Use {r.positionName} default: {r.suggestedPoint}
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {r.tipPoolGroups.filter((g) => weighted.has(g)).map((g) => (
                <label key={g} className="block">
                  <span className="block text-[10px] text-[var(--primary-700)] mb-0.5">{(POOL_LABELS[g] ?? g).split(" · ")[0]}</span>
                  <input
                    type="number"
                    step={0.1}
                    name={`point_${r.rosterEntryId}_${POOL_SUFFIX[g]}`}
                    value={points[`${r.rosterEntryId}:${g}`] ?? ""}
                    onChange={(e) =>
                      setPoints((p) => ({
                        ...p,
                        [`${r.rosterEntryId}:${g}`]: e.target.value === "" ? "" : Number(e.target.value) || 0,
                      }))
                    }
                    aria-invalid={r.needsDecision && points[`${r.rosterEntryId}:${g}`] === "" ? true : undefined}
                    className={
                      INPUT +
                      " max-w-24" +
                      (r.needsDecision && points[`${r.rosterEntryId}:${g}`] === ""
                        ? " border-[var(--warning-border)] bg-[var(--warning-tint)]"
                        : "")
                    }
                  />
                </label>
              ))}
              {/* Equal-split pools this row is also in: named, no field. */}
              {r.tipPoolGroups.filter((g) => !weighted.has(g)).map((g) => (
                <span key={g} className="self-end pb-2.5 text-[10px] text-[var(--ink-500)]">
                  {(POOL_LABELS[g] ?? g).split(" · ")[0]} — equal split
                </span>
              ))}
            </div>
          </div>
            ))}
          </Fragment>
        ))}
      </div>
      {poolTotals.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--paper)] flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-700)]">
          {poolTotals.map((t) => (
            <span key={t.pool}>
              {POOL_LABELS[t.pool] ?? t.pool}: <span className="font-medium tabular-nums">{t.total.toFixed(1)} pts</span>
              <span className="text-[var(--ink-500)]"> / {t.people} {t.people === 1 ? "person" : "people"}</span>
              {t.undecided > 0 && (
                <span className="text-[var(--warning-700)]"> · {t.undecided} not set yet</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The "what do these numbers cover?" question (2026-08-31, Aey's
 * run-through). Rendered ONLY when an earlier shift already closed today
 * — the one situation where a number copied off a screen might be a
 * day-to-date total rather than this shift's own. Warning-tinted and
 * unanswered by default on purpose: the manager must decide every time;
 * a remembered answer would be a silent default on money. The server
 * enforces the same requirement — this control is the friendly half of
 * a two-sided gate, not the gate itself. */
function DayTotalChooser({
  name,
  priorPeriod,
  sourceLabel,
  mode,
  onModeChange,
  dayDisabledReason,
  subtractLines,
  extraNote,
  priorIsDraft,
}: {
  name: string;
  priorPeriod: string;
  sourceLabel: string;
  mode: "" | "shift" | "day";
  onModeChange: (m: "shift" | "day") => void;
  dayDisabledReason: string | null;
  subtractLines: { label: string; amount: number }[];
  extraNote?: string;
  priorIsDraft: boolean;
}) {
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] p-3">
      <p className="text-sm font-medium text-[var(--ink-900)]">
        {priorPeriod} is already closed today — what do the {sourceLabel} numbers cover?
      </p>
      <p className="text-xs text-[var(--ink-700)] mt-0.5">
        Pick one before saving. This decides whether {priorPeriod}&apos;s saved numbers get subtracted.
      </p>
      <div className="mt-1">
        <label className="flex items-start gap-2.5 min-h-11 py-1.5 cursor-pointer text-sm">
          <input
            type="radio"
            name={name}
            value="shift"
            required
            checked={mode === "shift"}
            onChange={() => onModeChange("shift")}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary-700)]"
          />
          <span>
            <span className="font-medium text-[var(--ink-900)]">This shift only</span>
            <span className="block text-xs text-[var(--ink-500)]">
              The numbers do NOT include {priorPeriod} — save them exactly as typed.
            </span>
          </span>
        </label>
        <label
          className={
            "flex items-start gap-2.5 min-h-11 py-1.5 text-sm " +
            (dayDisabledReason ? "opacity-50 cursor-not-allowed" : "cursor-pointer")
          }
        >
          <input
            type="radio"
            name={name}
            value="day"
            required
            disabled={!!dayDisabledReason}
            checked={mode === "day"}
            onChange={() => onModeChange("day")}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary-700)]"
          />
          <span>
            <span className="font-medium text-[var(--ink-900)]">Whole day so far</span>
            <span className="block text-xs text-[var(--ink-500)]">
              The screen shows {priorPeriod} and this shift together — Atlas will subtract{" "}
              {priorPeriod}&apos;s saved numbers before saving, and the fields will show the result.
            </span>
          </span>
        </label>
      </div>
      {dayDisabledReason && <p className="text-xs text-[var(--warning-700)] mt-1">{dayDisabledReason}</p>}
      {mode === "day" && (
        <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] p-2.5">
          <p className="text-xs font-medium text-[var(--ink-900)] mb-1">
            Will subtract {priorPeriod}&apos;s saved numbers:
          </p>
          {subtractLines.length === 0 ? (
            <p className="text-xs text-[var(--ink-500)]">
              {priorPeriod} saved all zeros — nothing changes, but your choice is still recorded.
            </p>
          ) : (
            <ul className="text-xs text-[var(--ink-700)] space-y-0.5">
              {subtractLines.map((l) => (
                <li key={l.label} className="tabular-nums">
                  {l.label}: −${l.amount.toFixed(2)}
                </li>
              ))}
            </ul>
          )}
          {extraNote && <p className="text-xs text-[var(--ink-500)] mt-1.5">{extraNote}</p>}
          {priorIsDraft && (
            <p className="text-xs text-[var(--warning-700)] mt-1.5">
              {priorPeriod} is still a draft — if its numbers change later, come back and re-check this
              shift&apos;s.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The Toast sales card, split out of the main form (2026-08-31) so its
 * controlled fields live under the form's save-nonce key and remount
 * with fresh server values after every save — see the key comment on the
 * <form> element. Also hosts the Toast day-total question. */
function ToastSalesCard({
  s,
  taxRate,
  prior,
  isFinalized,
}: {
  s: ClosingReportData["sales"];
  taxRate: number;
  prior: PriorShiftFigures | null;
  isFinalized: boolean;
}) {
  // "" over a literal 0 for untouched fields (2026-08-25, Oliver) --
  // these two are controlled for the live tax recompute, so the empty
  // state rides in the state type. Blank posts as 0, same as before.
  const [totalSales, setTotalSales] = useState<number | "">(s?.totalSales || "");
  const [salesTax, setSalesTax] = useState<number | "">(s?.salesTax || "");
  const [taxTouched, setTaxTouched] = useState(s ? !s.salesTaxIsAuto : false);
  const [mode, setMode] = useState<"" | "shift" | "day">("");

  const dayMode = mode === "day" && !!prior?.toast;
  const lunchTotal = prior?.toast?.totalSales ?? 0;
  const liveDinnerTotal = dayMode && typeof totalSales === "number" ? round2(totalSales - lunchTotal) : null;

  return (
    <Card>
      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-3">Sales</legend>
        {prior && !isFinalized && (
          <DayTotalChooser
            name="toastEntryMode"
            priorPeriod={prior.period}
            sourceLabel="Toast"
            mode={mode}
            onModeChange={setMode}
            dayDisabledReason={
              prior.toast
                ? null
                : `${prior.period}'s closing report hasn't been saved yet, so there's nothing to subtract. ` +
                  `Save ${prior.period}'s report first if Toast is showing whole-day numbers.`
            }
            subtractLines={TOAST_DAY_TOTAL_FIELDS.map((f) => ({
              label: f.label,
              amount: prior.toast?.[f.key] ?? 0,
            })).filter((l) => l.amount !== 0)}
            extraNote="Cash tip is never subtracted — it's counted from the drawer, not copied from Toast."
            priorIsDraft={!prior.finalized}
          />
        )}
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">Total sales (Net, before tax)</span>
              <input
                type="number"
                step={0.01}
                name="totalSales"
                value={totalSales}
                placeholder="0"
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = Number(raw) || 0;
                  setTotalSales(raw === "" ? "" : val);
                  if (!taxTouched) setSalesTax(raw === "" ? "" : round2(val * taxRate));
                }}
                className={INPUT}
              />
            </label>
            {/* Live headline math for whole-day mode: the manager sees the
                per-shift result BEFORE saving, not only after. */}
            {liveDinnerTotal != null && (
              <p
                className={
                  "text-xs mt-1 tabular-nums " +
                  (liveDinnerTotal < 0 ? "text-[var(--danger-700)]" : "text-[var(--ink-700)]")
                }
              >
                {liveDinnerTotal < 0
                  ? `That's less than ${prior?.period}'s $${lunchTotal.toFixed(2)} alone — a day total can't be smaller. Check the number.`
                  : `− ${prior?.period} $${lunchTotal.toFixed(2)} = $${liveDinnerTotal.toFixed(2)} saved for this shift`}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">Sales tax</span>
              <input
                type="number"
                step={0.01}
                name="salesTax"
                value={salesTax}
                placeholder="0"
                onChange={(e) => {
                  setSalesTax(e.target.value === "" ? "" : Number(e.target.value) || 0);
                  setTaxTouched(true);
                }}
                className={INPUT}
              />
            </label>
            {!taxTouched && (
              <p className="text-xs text-[var(--ink-400)] mt-1">
                Auto-calculated from the tax rate in Settings ({(taxRate * 100).toFixed(3)}%) — edit if
                Toast&apos;s actual number differs.
              </p>
            )}
          </div>
          <Field label="CC tip total (Toast, all sources)" name="ccTipTotal" defaultValue={s?.ccTipTotal} />
          <Field label="Takeout CC tip (subset of above)" name="takeoutCcTip" defaultValue={s?.takeoutCcTip} />
          <Field label="Delivery Toast tip (subset of above)" name="deliveryToastTip" defaultValue={s?.deliveryToastTip} />
          <Field label="Cash sales" name="cashSales" defaultValue={s?.cashSales} />
          <Field label="Cash tip (entered by floor manager, no deduction)" name="cashTip" defaultValue={s?.cashTip} />
          <Field label="Gross food sales" name="grossFoodSales" defaultValue={s?.grossFoodSales} />
          <Field label="Gross beverage sales" name="grossBeverageSales" defaultValue={s?.grossBeverageSales} />
        </div>
        <p className="text-xs text-[var(--ink-500)] mt-2">
          &quot;CC tip total&quot; must be the FULL day&apos;s card tip total — takeout and delivery tip are a
          subset of it, not extra on top. Fill this in first. &quot;Total sales&quot; is Net Sale (before tax) —
          same meaning it&apos;s always had, tax is now tracked separately.
        </p>
      </fieldset>
    </Card>
  );
}

/** The online-platform card, split out (2026-08-31) to host the platform
 * day-total question — platform dashboards show day-to-date numbers
 * regardless of how Toast is configured, so this is a SEPARATE question
 * with its own answer, not a rider on the Toast one. */
function PlatformSalesCard({
  platforms,
  taxRate,
  prior,
  isFinalized,
}: {
  platforms: PlatformSalesRowData[];
  taxRate: number;
  prior: PriorShiftFigures | null;
  isFinalized: boolean;
}) {
  const [mode, setMode] = useState<"" | "shift" | "day">("");
  const askable = !!prior && prior.platforms.length > 0;
  const lunchByPlatformId = new Map((prior?.platforms ?? []).map((p) => [p.platformId, p.figures]));

  return (
    <Card>
      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-3">Online platform sales</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Split tips by who delivered: platform-courier tips feed Pool 2 (Host/Operator/Packer/Bag
          Handler), restaurant-driver tips feed Pool 3 (Delivery Guy).
        </p>
        {askable && !isFinalized && prior && (
          <DayTotalChooser
            name="platformEntryMode"
            priorPeriod={prior.period}
            sourceLabel="platform dashboard"
            mode={mode}
            onModeChange={setMode}
            dayDisabledReason={null}
            subtractLines={prior.platforms.flatMap((p) =>
              PLATFORM_DAY_TOTAL_FIELDS.map((f) => ({
                label: `${p.platformName} — ${f.label}`,
                amount: p.figures[f.key] ?? 0,
              })).filter((l) => l.amount !== 0)
            )}
            extraNote="Platform dashboards (DoorDash, Uber, …) usually show the whole day — check each one the same way you checked Toast."
            priorIsDraft={!prior.finalized}
          />
        )}
        <div className="space-y-4">
          {platforms.map((p) => (
            <PlatformSalesRow
              key={p.platformId}
              platform={p}
              taxRate={taxRate}
              dayMode={mode === "day"}
              lunchFigures={lunchByPlatformId.get(p.platformId)}
              priorPeriod={prior?.period}
            />
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

/** One online platform's Sales amount / Sales tax pair, split out as its
 * own component (2026-08-10) so each platform gets its own independent
 * live-recompute state — same pattern as the Toast Total sales/Sales tax
 * fields above, needed here per-platform since each platform's tax is
 * computed off ITS OWN sales amount, not a shared one. */
function PlatformSalesRow({
  platform: p,
  taxRate,
  dayMode,
  lunchFigures,
  priorPeriod,
}: {
  platform: PlatformSalesRowData;
  taxRate: number;
  dayMode?: boolean;
  lunchFigures?: Record<string, number>;
  priorPeriod?: string;
}) {
  const [salesAmount, setSalesAmount] = useState<number | "">(p.salesAmount || "");
  const [taxAmount, setTaxAmount] = useState<number | "">(p.taxAmount || "");
  const [taxTouched, setTaxTouched] = useState(!p.taxAmountIsAuto);

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)]">
      <div className="text-sm font-medium mb-2">
        {p.platformName}
        {dayMode && lunchFigures && (
          <span className="block text-xs font-normal text-[var(--ink-500)] tabular-nums">
            {priorPeriod} recorded: sales ${(lunchFigures.salesAmount ?? 0).toFixed(2)} — will be subtracted
            before saving
          </span>
        )}
        {dayMode && !lunchFigures && (
          <span className="block text-xs font-normal text-[var(--ink-500)]">
            {priorPeriod} recorded nothing for this platform — saved as typed
          </span>
        )}
      </div>
      <div className="grid sm:grid-cols-5 gap-3">
        <label className="text-sm block">
          <span className="block text-[var(--ink-500)] mb-1 min-h-10 flex items-end">Sales amount (Net)</span>
          <input
            type="number"
            step={0.01}
            name={`platform_${p.platformId}_salesAmount`}
            value={salesAmount}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value;
              const val = Number(raw) || 0;
              setSalesAmount(raw === "" ? "" : val);
              if (!taxTouched) setTaxAmount(raw === "" ? "" : round2(val * taxRate));
            }}
            className={INPUT}
          />
        </label>
        <div>
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1 min-h-10 flex items-end">Sales tax</span>
            <input
              type="number"
              step={0.01}
              name={`platform_${p.platformId}_taxAmount`}
              value={taxAmount}
              placeholder="0"
              onChange={(e) => {
                setTaxAmount(e.target.value === "" ? "" : Number(e.target.value) || 0);
                setTaxTouched(true);
              }}
              className={INPUT}
            />
          </label>
          {!taxTouched && <p className="text-xs text-[var(--ink-400)] mt-1">Auto-calculated, edit if it differs.</p>}
        </div>
        <Field label="Commission fee" name={`platform_${p.platformId}_commissionFee`} defaultValue={p.commissionFee} alignLabel />
        <Field label="Tip — platform courier" name={`platform_${p.platformId}_tipCourier`} defaultValue={p.tipAmountPlatformCourier} alignLabel />
        <Field label="Tip — restaurant delivery" name={`platform_${p.platformId}_tipRestaurantDelivery`} defaultValue={p.tipAmountRestaurantDelivery} alignLabel />
      </div>
    </div>
  );
}

function Field({ label, name, defaultValue, alignLabel }: { label: string; name: string; defaultValue?: number; alignLabel?: boolean }) {
  return (
    <label className="text-sm block">
      {/* alignLabel: in the 5-across platform grid, labels wrap to one or
          two lines (measured 20 vs 40px, 2026-08-24), leaving the input
          boxes at two different heights. Reserving two line-slots and
          bottom-aligning the text puts every input on one baseline. */}
      <span className={"block text-[var(--ink-500)] mb-1" + (alignLabel ? " min-h-10 flex items-end" : "")}>{label}</span>
      {/* Empty over a literal 0 (2026-08-25, Oliver: "i want default of
          field to be empty") -- a pre-filled 0 makes not-entered-yet
          indistinguishable from entered-zero. Blank posts as 0 server-
          side, so the math is untouched. */}
      <input
        type="number"
        step={0.01}
        name={name}
        defaultValue={defaultValue || ""}
        placeholder="0"
        className={INPUT}
      />
    </label>
  );
}
