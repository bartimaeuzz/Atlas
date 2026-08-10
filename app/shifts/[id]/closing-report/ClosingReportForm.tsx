"use client";

import { useActionState } from "react";
import {
  saveClosingReportSales, saveClosingReportAndPreview,
  type ClosingReportActionState,
} from "@/lib/actions/shift";
import type { ClosingReportData } from "@/lib/shift/loadClosingReportData";

const initialState: ClosingReportActionState = { error: null };

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
          <Field label="Total sales" name="totalSales" defaultValue={s?.totalSales} />
          <Field label="CC tip total (Toast, all sources)" name="ccTipTotal" defaultValue={s?.ccTipTotal} />
          <Field label="Takeout CC tip (subset of above)" name="takeoutCcTip" defaultValue={s?.takeoutCcTip} />
          <Field label="Delivery Toast tip (subset of above)" name="deliveryToastTip" defaultValue={s?.deliveryToastTip} />
          <Field label="Cash sales" name="cashSales" defaultValue={s?.cashSales} />
          <Field label="Gross food sales" name="grossFoodSales" defaultValue={s?.grossFoodSales} />
          <Field label="Gross beverage sales" name="grossBeverageSales" defaultValue={s?.grossBeverageSales} />
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          &quot;CC tip total&quot; must be the FULL day&apos;s card tip total — takeout and delivery tip are a
          subset of it, not extra on top. Fill this in first.
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
        <legend className="text-lg font-medium mb-3">Online platform sales</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Split tips by who delivered: platform-courier tips feed Pool 2 (Host/Operator/Packer/Bag
          Handler), restaurant-driver tips feed Pool 3 (Delivery Guy).
        </p>
        <div className="space-y-4">
          {data.platformSales.map((p) => (
            <div key={p.platformId} className="border rounded p-3">
              <div className="text-sm font-medium mb-2">{p.platformName}</div>
              <div className="grid sm:grid-cols-4 gap-3">
                <Field label="Sales amount" name={`platform_${p.platformId}_salesAmount`} defaultValue={p.salesAmount} />
                <Field label="Commission fee" name={`platform_${p.platformId}_commissionFee`} defaultValue={p.commissionFee} />
                <Field label="Tip — platform courier" name={`platform_${p.platformId}_tipCourier`} defaultValue={p.tipAmountPlatformCourier} />
                <Field label="Tip — restaurant delivery" name={`platform_${p.platformId}_tipRestaurantDelivery`} defaultValue={p.tipAmountRestaurantDelivery} />
              </div>
            </div>
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
