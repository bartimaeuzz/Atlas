"use client";

import { useActionState, useState } from "react";
import {
  saveClosingReportSales, saveClosingReportAndPreview,
  type ClosingReportActionState,
} from "@/lib/actions/shift";
import type { ClosingReportData, PlatformSalesRow as PlatformSalesRowData } from "@/lib/shift/loadClosingReportData";

const initialState: ClosingReportActionState = { error: null };

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

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
  const [totalSales, setTotalSales] = useState(s?.totalSales ?? 0);
  const [salesTax, setSalesTax] = useState(s?.salesTax ?? 0);
  const [taxTouched, setTaxTouched] = useState(s ? !s.salesTaxIsAuto : false);

  return (
    <form className="space-y-8">
      <input type="hidden" name="shiftId" value={shiftId} />

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save — nothing was recorded.</div>
          {error}
        </div>
      )}

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Sales</legend>
        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <label className="text-sm block">
            <span className="block text-neutral-500 mb-1">Total sales (Net, before tax)</span>
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
              className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
            />
          </label>
          <div>
            <label className="text-sm block">
              <span className="block text-neutral-500 mb-1">Sales tax</span>
              <input
                type="number"
                step={0.01}
                name="salesTax"
                value={salesTax}
                onChange={(e) => {
                  setSalesTax(Number(e.target.value) || 0);
                  setTaxTouched(true);
                }}
                className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
              />
            </label>
            {!taxTouched && (
              <p className="text-xs text-neutral-400 mt-1">
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
        <p className="text-xs text-neutral-500 mt-2">
          &quot;CC tip total&quot; must be the FULL day&apos;s card tip total — takeout and delivery tip are a
          subset of it, not extra on top. Fill this in first. &quot;Total sales&quot; is Net Sale (before tax) —
          same meaning it&apos;s always had, tax is now tracked separately.
        </p>
      </fieldset>

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Tip points</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Bump someone&apos;s point value for today only — e.g. they upsold a ton of drinks, or
          covered for someone. Defaults to their standing value; leave alone to change nothing.
          This does NOT change their permanent record, only this shift.
        </p>
        {data.pointValueRows.length === 0 ? (
          <p className="text-sm text-neutral-500">No tip-pool-eligible staff on the roster yet.</p>
        ) : (
          <table className="text-sm border-collapse">
            <tbody>
              {data.pointValueRows.map((r) => (
                <tr key={r.rosterEntryId}>
                  <td className="pr-4 py-1">{r.employeeName}</td>
                  <td className="pr-4 py-1 text-neutral-500">{r.positionName}</td>
                  <td className="pr-4 py-1">
                    <input
                      type="number"
                      step={0.1}
                      name={`point_${r.rosterEntryId}`}
                      defaultValue={r.pointValue}
                      className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Bonus metrics</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Restaurant-configurable bonuses — today that's the host team&apos;s shared
          drink count (paid $ per drink, pulled off the top of Pool 1 before the
          split, then split equally among whoever worked Host — see Preview).
          Adding a new bonus later shows up here automatically, no page changes needed.
        </p>

        {data.shiftMetricRows.length > 0 && (
          <div className="space-y-3 mb-4">
            {data.shiftMetricRows.map((r) => (
              <label key={r.metricDefinitionId} className="text-sm block max-w-xs">
                <span className="block text-neutral-500 mb-1">{r.metricLabel}</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  name={`metric_shift_${r.metricDefinitionId}`}
                  defaultValue={r.currentValue}
                  className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                />
              </label>
            ))}
          </div>
        )}

        {data.metricRows.length > 0 && (
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-normal pr-4 pb-1">Employee</th>
                <th className="text-left font-normal pr-4 pb-1">Position</th>
                <th className="text-left font-normal pr-4 pb-1">Metric</th>
                <th className="text-left font-normal pr-4 pb-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.metricRows.map((r) => (
                <tr key={`${r.metricDefinitionId}_${r.employeeId}`}>
                  <td className="pr-4 py-1">{r.employeeName}</td>
                  <td className="pr-4 py-1 text-neutral-500">{r.positionName}</td>
                  <td className="pr-4 py-1 text-neutral-500">{r.metricLabel}</td>
                  <td className="pr-4 py-1">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      name={`metric_emp_${r.metricDefinitionId}_${r.employeeId}`}
                      defaultValue={r.currentValue}
                      className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data.shiftMetricRows.length === 0 && data.metricRows.length === 0 && (
          <p className="text-sm text-neutral-500">No bonus-eligible staff on the roster yet.</p>
        )}
      </fieldset>

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Wage adjustments</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Optional, for shift-coverage situations — e.g. Erika works Host but covers Aey&apos;s
          Bartender shift when Aey calls in sick. &quot;Override&quot; replaces the system&apos;s
          normal wage pick if it&apos;s wrong; &quot;Extra pay&quot; is always added ON TOP and shows
          as its own line in Preview/Summary, separate from the regular wage. Leave both blank to
          change nothing.
        </p>
        {data.wageAdjustmentRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Nobody on the roster yet.</p>
        ) : (
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-normal pr-4 pb-1">Employee</th>
                <th className="text-left font-normal pr-4 pb-1">Auto wage</th>
                <th className="text-left font-normal pr-4 pb-1">Override</th>
                <th className="text-left font-normal pr-4 pb-1">Extra pay</th>
                <th className="text-left font-normal pr-4 pb-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.wageAdjustmentRows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="pr-4 py-1">
                    {r.employeeName}
                    <span className="block text-xs text-neutral-500">{r.wageBearingPositionName}</span>
                  </td>
                  <td className="pr-4 py-1 text-neutral-500">
                    {r.autoResolvedWage != null ? `$${r.autoResolvedWage.toFixed(2)}` : "—"}
                  </td>
                  <td className="pr-4 py-1">
                    <input
                      type="number"
                      step={0.01}
                      name={`wageOverride_${r.employeeId}`}
                      defaultValue={r.wageOverrideAmount ?? ""}
                      placeholder="auto"
                      className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                    />
                  </td>
                  <td className="pr-4 py-1">
                    <input
                      type="number"
                      step={0.01}
                      name={`extraPay_${r.employeeId}`}
                      defaultValue={r.extraPayAmount || ""}
                      placeholder="0"
                      className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                    />
                  </td>
                  <td className="pr-4 py-1">
                    <input
                      type="text"
                      name={`wageReason_${r.employeeId}`}
                      defaultValue={r.reason ?? ""}
                      placeholder="optional note"
                      className="border rounded px-2 py-1 w-40 disabled:bg-neutral-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Disciplinary deductions</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Optional, for disciplinary/correction issues (late, property damage, etc.) — since wages
          are flat-rate, a deduction can&apos;t come out of hours worked, so it&apos;s a direct dollar
          amount subtracted from that person&apos;s payout. Shown to the employee themselves and
          managers only — never visible to coworkers. Takes effect as soon as you save, same as
          wage adjustments above. Leave blank to change nothing.
        </p>
        {data.wageAdjustmentRows.length === 0 ? (
          <p className="text-sm text-neutral-500">Nobody on the roster yet.</p>
        ) : (
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-normal pr-4 pb-1">Employee</th>
                <th className="text-left font-normal pr-4 pb-1">Deduction</th>
                <th className="text-left font-normal pr-4 pb-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.wageAdjustmentRows.map((r) => (
                <tr key={r.employeeId}>
                  <td className="pr-4 py-1">{r.employeeName}</td>
                  <td className="pr-4 py-1">
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      name={`deduction_${r.employeeId}`}
                      defaultValue={r.deductionAmount || ""}
                      placeholder="0"
                      className="border rounded px-2 py-1 w-24 disabled:bg-neutral-100"
                    />
                  </td>
                  <td className="pr-4 py-1">
                    <input
                      type="text"
                      name={`deductionReason_${r.employeeId}`}
                      defaultValue={r.deductionReason ?? ""}
                      placeholder="e.g. 45 min late"
                      className="border rounded px-2 py-1 w-40 disabled:bg-neutral-100"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>

      <fieldset disabled={isFinalized}>
        <legend className="text-lg font-medium mb-3">Online platform sales</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Split tips by who delivered: platform-courier tips feed Pool 2 (Host/Operator/Packer/Bag
          Handler), restaurant-driver tips feed Pool 3 (Delivery Guy).
        </p>
        <div className="space-y-4">
          {data.platformSales.map((p) => (
            <PlatformSalesRow key={p.platformId} platform={p} taxRate={taxRate} />
          ))}
        </div>
      </fieldset>

      {!isFinalized && (
        <div className="flex gap-3">
          <button
            formAction={saveFormAction}
            disabled={isSaving || isGoingToPreview}
            className="border border-neutral-300 px-4 py-2 rounded hover:bg-neutral-50 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save (draft)"}
          </button>
          <button
            formAction={previewFormAction}
            disabled={isSaving || isGoingToPreview}
            className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 disabled:opacity-50"
          >
            {isGoingToPreview ? "Saving…" : "Save & Preview →"}
          </button>
        </div>
      )}
    </form>
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
    <div className="border rounded p-3">
      <div className="text-sm font-medium mb-2">{p.platformName}</div>
      <div className="grid sm:grid-cols-5 gap-3">
        <label className="text-sm block">
          <span className="block text-neutral-500 mb-1">Sales amount (Net)</span>
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
            className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
          />
        </label>
        <div>
          <label className="text-sm block">
            <span className="block text-neutral-500 mb-1">Sales tax</span>
            <input
              type="number"
              step={0.01}
              name={`platform_${p.platformId}_taxAmount`}
              value={taxAmount}
              onChange={(e) => {
                setTaxAmount(Number(e.target.value) || 0);
                setTaxTouched(true);
              }}
              className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
            />
          </label>
          {!taxTouched && <p className="text-xs text-neutral-400 mt-1">Auto-calculated, edit if it differs.</p>}
        </div>
        <Field label="Commission fee" name={`platform_${p.platformId}_commissionFee`} defaultValue={p.commissionFee} />
        <Field label="Tip — platform courier" name={`platform_${p.platformId}_tipCourier`} defaultValue={p.tipAmountPlatformCourier} />
        <Field label="Tip — restaurant delivery" name={`platform_${p.platformId}_tipRestaurantDelivery`} defaultValue={p.tipAmountRestaurantDelivery} />
      </div>
    </div>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue?: number }) {
  return (
    <label className="text-sm block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <input
        type="number"
        step={0.01}
        name={name}
        defaultValue={defaultValue ?? 0}
        className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
      />
    </label>
  );
}
