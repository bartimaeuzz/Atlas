"use client";

import { useActionState } from "react";
import {
  saveClosingReportSales, saveClosingReportAndFinalize,
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
  const [finalizeState, finalizeFormAction, isFinalizing] = useActionState(saveClosingReportAndFinalize, initialState);
  const s = data.sales;
  const error = saveState.error ?? finalizeState.error;

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
            disabled={isSaving || isFinalizing}
            className="border border-neutral-300 px-4 py-2 rounded hover:bg-neutral-50 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save (draft)"}
          </button>
          <button
            formAction={finalizeFormAction}
            disabled={isSaving || isFinalizing}
            className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 disabled:opacity-50"
          >
            {isFinalizing ? "Saving…" : "Save & Finalize → View Summary"}
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
