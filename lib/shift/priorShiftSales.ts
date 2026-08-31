/** Day-total subtraction at second-shift close (2026-08-31, from Aey's
 * run-through). Toast may report sales cumulatively for the whole day
 * rather than per shift — nobody is sure yet which way Youk's Toast will
 * be configured, and online-platform dashboards (DoorDash/Uber/etc.) are
 * day-to-date regardless. So the Dinner close asks the manager what the
 * numbers they are copying COVER — "this shift only" or "whole day" —
 * and when the answer is whole-day, Atlas subtracts Lunch's saved
 * figures field by field before anything is stored. The subtraction is
 * never silent: the form previews it, the saved result re-renders into
 * the fields, and the activity log keeps the raw entered numbers.
 *
 * Deliberately a pure module: the money math is testable without a DB,
 * and the action layer (lib/actions/shift.ts) stays a thin caller.
 *
 * Cash tip is NOT in the field list on purpose — it is counted from the
 * physical drawer at each close, not copied from a screen, so it is
 * per-shift by construction (confirmed with Oliver 2026-08-31). */

export interface DayTotalField {
  key: string;
  label: string;
}

/** Every shiftSales field whose number comes off the Toast screen.
 * If Toast accumulates, it accumulates ALL of these, not just totals. */
export const TOAST_DAY_TOTAL_FIELDS: DayTotalField[] = [
  { key: "totalSales", label: "Total sales" },
  { key: "salesTax", label: "Sales tax" },
  { key: "ccTipTotal", label: "CC tip total" },
  { key: "takeoutCcTip", label: "Takeout CC tip" },
  { key: "deliveryToastTip", label: "Delivery Toast tip" },
  { key: "cashSales", label: "Cash sales" },
  { key: "grossFoodSales", label: "Gross food sales" },
  { key: "grossBeverageSales", label: "Gross beverage sales" },
];

/** Per-platform fields copied from that platform's own dashboard. */
export const PLATFORM_DAY_TOTAL_FIELDS: DayTotalField[] = [
  { key: "salesAmount", label: "Sales amount" },
  { key: "taxAmount", label: "Sales tax" },
  { key: "commissionFee", label: "Commission fee" },
  { key: "tipAmountPlatformCourier", label: "Tip — platform courier" },
  { key: "tipAmountRestaurantDelivery", label: "Tip — restaurant delivery" },
];

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export type SubtractResult =
  | { ok: true; values: Record<string, number> }
  | { ok: false; error: string };

/** Subtract the prior shift's saved figures from whole-day entries.
 *
 * Refuses (rather than clamping to zero) when any entered day total is
 * smaller than what the prior shift alone already recorded — that can
 * only mean the entered number is wrong or the manager picked the wrong
 * mode, and clamping would quietly store money that never existed.
 * `contextLabel` names the block in the error ("Toast", a platform name)
 * so the manager knows which card to fix. */
export function subtractDayTotals(
  entered: Record<string, number>,
  prior: Record<string, number>,
  fields: DayTotalField[],
  contextLabel: string,
  priorPeriodLabel: string
): SubtractResult {
  const values: Record<string, number> = { ...entered };
  for (const f of fields) {
    const enteredValue = entered[f.key] ?? 0;
    const priorValue = prior[f.key] ?? 0;
    const result = round2(enteredValue - priorValue);
    if (result < 0) {
      return {
        ok: false,
        error:
          `${contextLabel} — ${f.label}: the whole-day number you entered (${money(enteredValue)}) is smaller ` +
          `than what ${priorPeriodLabel} alone already recorded (${money(priorValue)}). A day total can't be ` +
          `less than ${priorPeriodLabel}'s share. Check the number, or choose "This shift only". Nothing was saved.`,
      };
    }
    values[f.key] = result;
  }
  return { ok: true, values };
}
