"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveClosingReportSales, saveClosingReportAndPreview,
  type ClosingReportActionState,
} from "@/lib/actions/shift";
import type { ClosingReportData, PlatformSalesRow as PlatformSalesRowData } from "@/lib/shift/loadClosingReportData";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronDownIcon } from "@/components/ui/icons";

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
  const s = data.sales;
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

  const [totalSales, setTotalSales] = useState(s?.totalSales ?? 0);
  const [salesTax, setSalesTax] = useState(s?.salesTax ?? 0);
  const [taxTouched, setTaxTouched] = useState(s ? !s.salesTaxIsAuto : false);

  return (
    <form className="space-y-4">
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
      <Card>
      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-3">Sales</legend>
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">Total sales (Net, before tax)</span>
            <input
              type="number"
              step={0.01}
              name="totalSales"
              value={totalSales}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setTotalSales(val);
                if (!taxTouched) setSalesTax(round2(val * taxRate));
              }}
              className={INPUT}
            />
          </label>
          <div>
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">Sales tax</span>
              <input
                type="number"
                step={0.01}
                name="salesTax"
                value={salesTax}
                onChange={(e) => {
                  setSalesTax(Number(e.target.value) || 0);
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

      <Card>
      <details open={hasTipBumps} className="group">
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-lg font-medium text-[var(--ink-900)] min-h-11 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Tip points
            {hasTipBumps && <span className="text-xs font-normal text-[var(--ink-500)]">— has entries</span>}
          </span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
        <fieldset disabled={isFinalized} className="mt-2">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Bump someone&apos;s point value for today only — e.g. they upsold a ton of drinks, or
          covered for someone. Defaults to their standing value; leave alone to change nothing.
          This does NOT change their permanent record, only this shift.
        </p>
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
          Restaurant-configurable bonuses — today that's the host team&apos;s shared
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
                  defaultValue={r.currentValue}
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
                      defaultValue={r.currentValue}
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

      <Card>
      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-3">Online platform sales</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Split tips by who delivered: platform-courier tips feed Pool 2 (Host/Operator/Packer/Bag
          Handler), restaurant-driver tips feed Pool 3 (Delivery Guy).
        </p>
        <div className="space-y-4">
          {data.platformSales.map((p) => (
            <PlatformSalesRow key={p.platformId} platform={p} taxRate={taxRate} />
          ))}
        </div>
      </fieldset>
      </Card>

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
  const [points, setPoints] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      editableRows.flatMap((r) =>
        r.tipPoolGroups.filter((g) => weighted.has(g)).map((g) => [`${r.rosterEntryId}:${g}`, r.pointValueByPool[g] ?? 1.0])
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
      total: members.reduce((sum, r) => sum + (points[`${r.rosterEntryId}:${pool}`] || 0), 0),
      people: members.length,
    };
  });

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--card)]">
        <span>Employee</span>
        <span>Points per pool</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {editableRows.map((r) => (
          <div key={r.rosterEntryId} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] gap-2 px-3 py-2 items-center bg-[var(--card)]">
            <div className="text-sm text-[var(--ink-900)]">
              {r.employeeName}
              <span className="block text-xs text-[var(--ink-500)]">{r.positionName}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {r.tipPoolGroups.filter((g) => weighted.has(g)).map((g) => (
                <label key={g} className="block">
                  <span className="block text-[10px] text-[var(--primary-700)] mb-0.5">{(POOL_LABELS[g] ?? g).split(" · ")[0]}</span>
                  <input
                    type="number"
                    step={0.1}
                    name={`point_${r.rosterEntryId}_${POOL_SUFFIX[g]}`}
                    value={points[`${r.rosterEntryId}:${g}`] ?? 0}
                    onChange={(e) => setPoints((p) => ({ ...p, [`${r.rosterEntryId}:${g}`]: Number(e.target.value) || 0 }))}
                    className={INPUT + " max-w-24"}
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
      </div>
      {poolTotals.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--paper)] flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-700)]">
          {poolTotals.map((t) => (
            <span key={t.pool}>
              {POOL_LABELS[t.pool] ?? t.pool}: <span className="font-medium tabular-nums">{t.total.toFixed(1)} pts</span>
              <span className="text-[var(--ink-500)]"> / {t.people} {t.people === 1 ? "person" : "people"}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One online platform's Sales amount / Sales tax pair, split out as its
 * own component (2026-08-10) so each platform gets its own independent
 * live-recompute state — same pattern as the Toast Total sales/Sales tax
 * fields above, needed here per-platform since each platform's tax is
 * computed off ITS OWN sales amount, not a shared one. */
function PlatformSalesRow({ platform: p, taxRate }: { platform: PlatformSalesRowData; taxRate: number }) {
  const [salesAmount, setSalesAmount] = useState(p.salesAmount);
  const [taxAmount, setTaxAmount] = useState(p.taxAmount);
  const [taxTouched, setTaxTouched] = useState(!p.taxAmountIsAuto);

  return (
    <div className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)]">
      <div className="text-sm font-medium mb-2">{p.platformName}</div>
      <div className="grid sm:grid-cols-5 gap-3">
        <label className="text-sm block">
          <span className="block text-[var(--ink-500)] mb-1 min-h-10 flex items-end">Sales amount (Net)</span>
          <input
            type="number"
            step={0.01}
            name={`platform_${p.platformId}_salesAmount`}
            value={salesAmount}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setSalesAmount(val);
              if (!taxTouched) setTaxAmount(round2(val * taxRate));
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
              onChange={(e) => {
                setTaxAmount(Number(e.target.value) || 0);
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
      <input
        type="number"
        step={0.01}
        name={name}
        defaultValue={defaultValue ?? 0}
        className={INPUT}
      />
    </label>
  );
}
