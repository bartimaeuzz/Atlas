"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftRosterEntries, shiftSales, onlinePlatformSalesRecords,
  onlinePlatforms, tipPoolCalculations, employeePayouts, metricValues,
} from "@/db/schema";
import { computeFinalizationPreview } from "@/lib/shift/computeFinalizationPreview";

/** Creates a new draft shift for a date + meal period, then sends the
 * manager straight into building the roster for it. */
export async function createShift(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const period = String(formData.get("period") ?? "");
  if (!date || (period !== "Lunch" && period !== "Dinner")) {
    throw new Error("Date and period (Lunch/Dinner) are required");
  }

  const [existing] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.date, date), eq(shifts.period, period as "Lunch" | "Dinner")));

  const shift =
    existing ??
    (await db.insert(shifts).values({ date, period: period as "Lunch" | "Dinner", status: "draft" }).returning())[0];

  revalidatePath("/shifts");
  redirect(`/shifts/${shift.id}/roster`);
}

export async function addRosterEntry(formData: FormData) {
  const shiftId = Number(formData.get("shiftId"));
  const employeeId = Number(formData.get("employeeId"));
  const positionId = Number(formData.get("positionId"));

  if (!shiftId || !employeeId || !positionId) {
    throw new Error("Employee and position are required");
  }

  await assertDraft(shiftId);

  // Point value override is NOT set here on purpose — it's a closing-time
  // judgment call ("did great today"), entered on the Closing Report page
  // right before Save, not a staffing decision made when building the
  // roster hours earlier. New entries start with no override (resolves to
  // the employee's standing point value until someone bumps it later).
  await db.insert(shiftRosterEntries).values({
    shiftId,
    employeeId,
    positionId,
  });

  revalidatePath(`/shifts/${shiftId}/roster`);
}

export async function removeRosterEntry(formData: FormData) {
  const rosterEntryId = Number(formData.get("rosterEntryId"));
  const shiftId = Number(formData.get("shiftId"));
  if (!rosterEntryId || !shiftId) throw new Error("Missing roster entry");

  await assertDraft(shiftId);

  await db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId));
  revalidatePath(`/shifts/${shiftId}/roster`);
}

export interface ClosingReportActionState {
  error: string | null;
}

/** Upserts the one ShiftSales row + all four OnlinePlatformSalesRecord rows
 * for a shift in one submit — this is the "closing report" sales entry.
 *
 * Signature matches React's useActionState (prevState, formData) so the
 * client form can catch validation errors (e.g. Takeout + Delivery tip
 * exceeding Total CC Tip) and show them inline instead of letting them
 * escape as an uncaught error, which would otherwise render Next.js's
 * generic/technical error page — not something a restaurant manager should
 * ever see mid-shift. Caught directly by Oliver testing this 2026-08-08. */
export async function saveClosingReportSales(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    await assertDraft(shiftId);
    await upsertClosingReportSales(shiftId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}/closing-report`);
  return { error: null };
}

/** "Save & Preview" from the closing report form — persists whatever's in
 * the form fields right now, then sends the manager to the Preview page
 * (computed live, nothing locked yet) instead of finalizing immediately.
 * Split into an explicit Save-then-Preview-then-Confirm flow on 2026-08-08
 * after Oliver pointed out that finalizing right away, with no review step,
 * meant a typo could get permanently baked into a locked payroll record —
 * see confirmFinalize below for the step that actually locks it. Same
 * error-handling reasoning as saveClosingReportSales above — redirect() is
 * deliberately called AFTER the try/catch, not inside it. */
export async function saveClosingReportAndPreview(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    await assertDraft(shiftId);
    await upsertClosingReportSales(shiftId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}/preview`);
  redirect(`/shifts/${shiftId}/preview`);
}

/** The actual lock step — only reachable from the Preview page, after the
 * manager has already seen the computed numbers. Recomputes fresh from
 * current DB state (not from whatever the client had in memory) so it's
 * always accurate even if something changed since the preview was shown,
 * then writes the locked snapshot. */
export async function confirmFinalize(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    await assertDraft(shiftId);
    await runFinalize(shiftId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/summary`);
}

async function upsertClosingReportSales(shiftId: number, formData: FormData) {
  await upsertPointOverrides(shiftId, formData);
  await upsertMetricValues(shiftId, formData);

  const num = (key: string) => Number(formData.get(key) ?? 0) || 0;

  const salesValues = {
    totalSales: num("totalSales"),
    ccTipTotal: num("ccTipTotal"),
    takeoutCcTip: num("takeoutCcTip"),
    deliveryToastTip: num("deliveryToastTip"),
    cashSales: num("cashSales"),
    grossFoodSales: num("grossFoodSales"),
    grossBeverageSales: num("grossBeverageSales"),
  };

  const [existing] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  if (existing) {
    await db.update(shiftSales).set(salesValues).where(eq(shiftSales.shiftId, shiftId));
  } else {
    await db.insert(shiftSales).values({ shiftId, ...salesValues });
  }

  const platforms = await db.select().from(onlinePlatforms);
  for (const platform of platforms) {
    const salesAmount = num(`platform_${platform.id}_salesAmount`);
    const commissionFee = num(`platform_${platform.id}_commissionFee`);
    const tipAmountPlatformCourier = num(`platform_${platform.id}_tipCourier`);
    const tipAmountRestaurantDelivery = num(`platform_${platform.id}_tipRestaurantDelivery`);
    const netAmount = Math.round((salesAmount - commissionFee) * 100) / 100;

    const [existingRecord] = await db
      .select()
      .from(onlinePlatformSalesRecords)
      .where(
        and(
          eq(onlinePlatformSalesRecords.shiftId, shiftId),
          eq(onlinePlatformSalesRecords.onlinePlatformId, platform.id)
        )
      );

    const values = { salesAmount, commissionFee, netAmount, tipAmountPlatformCourier, tipAmountRestaurantDelivery };
    if (existingRecord) {
      await db
        .update(onlinePlatformSalesRecords)
        .set(values)
        .where(eq(onlinePlatformSalesRecords.id, existingRecord.id));
    } else {
      await db.insert(onlinePlatformSalesRecords).values({ shiftId, onlinePlatformId: platform.id, ...values });
    }
  }
}

/** Point value overrides live on the closing report, not the roster page —
 * see the comment in addRosterEntry above for why. Only touches rows whose
 * input was actually present on the submitted form (tip-pool-eligible rows
 * render an input; NONE-pool rows like Manager don't, so they're skipped
 * here automatically). Blank input clears the override back to the
 * employee's standing point value. */
async function upsertPointOverrides(shiftId: number, formData: FormData) {
  const rosterRows = await db.select().from(shiftRosterEntries).where(eq(shiftRosterEntries.shiftId, shiftId));
  for (const entry of rosterRows) {
    const raw = formData.get(`point_${entry.id}`);
    if (raw == null) continue;
    const trimmed = String(raw).trim();
    const pointValueOverride = trimmed === "" ? null : Number(trimmed);
    if (pointValueOverride != null && Number.isNaN(pointValueOverride)) continue;
    await db.update(shiftRosterEntries).set({ pointValueOverride }).where(eq(shiftRosterEntries.id, entry.id));
  }
}

/** "Bonus metrics" live in the generic metricValues table. Two distinct
 * field naming patterns, deliberately disambiguated so the regex can't
 * mix them up:
 *   - `metric_shift_<metricDefinitionId>` — ONE value for the whole shift
 *     (e.g. the host team's shared drink count — corrected 2026-08-10,
 *     was per-employee before). Stored with employeeId = null.
 *   - `metric_emp_<metricDefinitionId>_<employeeId>` — one value per
 *     eligible person (for a future metric that genuinely is per-employee).
 * Rendered only for eligible (position, metric) pairs by loadClosingReportData,
 * so this just scans for whatever showed up rather than re-deriving
 * eligibility server-side — same trust-the-rendered-form pattern as
 * upsertPointOverrides above. Blank/0 clears it back to 0 (no bonus). */
async function upsertMetricValues(shiftId: number, formData: FormData) {
  for (const [key, raw] of formData.entries()) {
    const trimmed = String(raw).trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    if (Number.isNaN(value)) continue;

    const shiftMatch = /^metric_shift_(\d+)$/.exec(key);
    if (shiftMatch) {
      const metricDefinitionId = Number(shiftMatch[1]);
      const [existing] = await db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.shiftId, shiftId),
            eq(metricValues.metricDefinitionId, metricDefinitionId),
            isNull(metricValues.employeeId)
          )
        );
      if (existing) {
        await db.update(metricValues).set({ value }).where(eq(metricValues.id, existing.id));
      } else {
        await db.insert(metricValues).values({ shiftId, metricDefinitionId, employeeId: null, value });
      }
      continue;
    }

    const empMatch = /^metric_emp_(\d+)_(\d+)$/.exec(key);
    if (empMatch) {
      const metricDefinitionId = Number(empMatch[1]);
      const employeeId = Number(empMatch[2]);
      const [existing] = await db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.shiftId, shiftId),
            eq(metricValues.metricDefinitionId, metricDefinitionId),
            eq(metricValues.employeeId, employeeId)
          )
        );
      if (existing) {
        await db.update(metricValues).set({ value }).where(eq(metricValues.id, existing.id));
      } else {
        await db.insert(metricValues).values({ shiftId, metricDefinitionId, employeeId, value });
      }
    }
  }
}

/** The actual write step — computes via the shared helper (same one the
 * Preview page uses) and writes the locked snapshot. Chosen deliberately
 * over recompute-on-view for the Summary Report: a closing report is a
 * historical record and shouldn't silently change if settings (deduction
 * rate, split method, point values) change later. */
async function runFinalize(shiftId: number) {
  const { result } = await computeFinalizationPreview(shiftId);

  await db.insert(tipPoolCalculations).values({ shiftId, ...result.tipPoolCalculation });
  for (const payout of result.employeePayouts) {
    await db.insert(employeePayouts).values({ shiftId, ...payout });
  }

  await db
    .update(shifts)
    .set({ status: "finalized", finalizedAt: new Date().toISOString() })
    .where(eq(shifts.id, shiftId));
}

async function assertDraft(shiftId: number) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) throw new Error("Shift not found");
  if (shift.status === "finalized") {
    throw new Error("This shift is already finalized and locked — view the Summary Report instead.");
  }
}

