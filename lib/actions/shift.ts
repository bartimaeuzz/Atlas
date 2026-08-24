"use server";

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftRosterEntries, shiftSales, onlinePlatformSalesRecords,
  onlinePlatforms, metricValues,
  shiftWageAdjustments,
  scheduleWeeks, plannedShiftAssignments,
} from "@/db/schema";
import { finalizeShiftWrites } from "@/lib/shift/finalizeShiftWrites";
import { weekStartFor } from "@/lib/schedule/weekMath";
import { getCurrentStaffSession } from "@/lib/auth/session";

/** 2026-08-21 — server-action auth audit: this file had NO auth check at
 * all before, on any of its six exported actions, including
 * confirmFinalize (the step that permanently locks a shift's payroll
 * numbers). The page-level requireManager() guard on /shifts/* protects
 * page loads, not a Server Action's own POST endpoint called directly —
 * same gap class already found and fixed in employees.ts/tipPools.ts/
 * payroll.ts/permissions.ts, see project_atlas_security_audit_2026_08_17
 * memory. Same established pattern, copied as-is. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
}

/** Auto-seeds a brand-new shift's roster from a PUBLISHED weekly plan
 * (Schedule Planner Phase 2, 2026-08-11) — confirmed with Oliver: this is
 * exactly the point of publishing a plan, so nobody has to re-enter the
 * same names on the day the shift actually happens. Draft (unpublished)
 * weeks are deliberately ignored — only a published plan is trustworthy
 * enough to auto-populate real payroll-affecting rows. Silently does
 * nothing if there's no published plan for this date/period, which is
 * the common case today (most shifts still get built by hand until the
 * planner is in regular use) — this is additive, not a requirement. */
async function seedRosterFromPublishedPlan(shiftId: number, date: string, period: "Lunch" | "Dinner") {
  const weekStartDate = weekStartFor(date);
  const [week] = await db
    .select()
    .from(scheduleWeeks)
    .where(and(eq(scheduleWeeks.weekStartDate, weekStartDate), eq(scheduleWeeks.status, "published")));
  if (!week) return;

  const planned = await db
    .select()
    .from(plannedShiftAssignments)
    .where(
      and(
        eq(plannedShiftAssignments.weekId, week.id),
        eq(plannedShiftAssignments.date, date),
        eq(plannedShiftAssignments.period, period)
      )
    );
  if (planned.length === 0) return;

  await db.insert(shiftRosterEntries).values(
    planned.map((p) => ({ shiftId, employeeId: p.employeeId, positionId: p.positionId }))
  );
}

/** Creates a new draft shift for a date + meal period, then sends the
 * manager straight into building the roster for it. Auto-seeds the
 * roster from a published weekly plan for a NEWLY created shift only —
 * the existing "Add someone" flow on the roster page (untouched) still
 * handles same-day fixes on top of whatever gets seeded here. */
export interface CreateShiftState {
  error: string | null;
  /** Set instead of redirecting when the date+period shift already exists
   * (2026-08-24, Oliver): the old behaviour silently opened the existing
   * shift's roster, which read as "created" when nothing was. The form
   * shows a dialog -- Cancel | Go to that shift -- so the manager knows. */
  existing?: { id: number; status: "draft" | "finalized"; date: string; period: string };
}

export async function createShift(_prev: CreateShiftState, formData: FormData): Promise<CreateShiftState> {
  let shiftId: number;
  try {
    await requireManagerAction();

    const date = String(formData.get("date") ?? "");
    const period = String(formData.get("period") ?? "");
    if (!date || (period !== "Lunch" && period !== "Dinner")) {
      throw new Error("Date and period (Lunch/Dinner) are required");
    }

    const [existing] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.date, date), eq(shifts.period, period as "Lunch" | "Dinner")));

    if (existing) {
      return {
        error: null,
        existing: { id: existing.id, status: existing.status as "draft" | "finalized", date, period },
      };
    }

    const [shift] = await db
      .insert(shifts)
      .values({ date, period: period as "Lunch" | "Dinner", status: "draft" })
      .returning();
    await seedRosterFromPublishedPlan(shift.id, date, period as "Lunch" | "Dinner");
    shiftId = shift.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/roster`);
}

export async function addRosterEntry(formData: FormData): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireManagerAction();

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
});
}

export async function removeRosterEntry(formData: FormData): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireManagerAction();

    const rosterEntryId = Number(formData.get("rosterEntryId"));
    const shiftId = Number(formData.get("shiftId"));
    if (!rosterEntryId || !shiftId) throw new Error("Missing roster entry");

    await assertDraft(shiftId);

    await db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId));
    revalidatePath(`/shifts/${shiftId}/roster`);
});
}

export interface ClosingReportActionState {
  error: string | null;
  /** Stamp of the last successful draft save -- the form flips its button
   * to "Saved" for a moment when this changes (2026-08-24, Oliver). A
   * nonce, not a display value; each save returns a fresh one. */
  savedAt?: number;
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
    await requireManagerAction();
    await assertDraft(shiftId);
    await upsertClosingReportSales(shiftId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}/closing-report`);
  return { error: null, savedAt: Date.now() };
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
    await requireManagerAction();
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
    await requireManagerAction();
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
  await upsertWageAdjustments(shiftId, formData);

  const num = (key: string) => Number(formData.get(key) ?? 0) || 0;

  const salesValues = {
    totalSales: num("totalSales"),
    ccTipTotal: num("ccTipTotal"),
    takeoutCcTip: num("takeoutCcTip"),
    deliveryToastTip: num("deliveryToastTip"),
    cashSales: num("cashSales"),
    cashTip: num("cashTip"),
    grossFoodSales: num("grossFoodSales"),
    grossBeverageSales: num("grossBeverageSales"),
    // Sales tax (2026-08-10) — the form field is pre-filled with an
    // auto-computed suggestion (totalSales × defaultSalesTaxRate) by the
    // loader, but whatever's actually in the field on submit is what gets
    // saved, same as every other sales field here — once a manager saves
    // the report (even unchanged), that number becomes the real, explicit
    // figure for this shift, no longer just a suggestion.
    salesTax: num("salesTax"),
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
    const taxAmount = num(`platform_${platform.id}_taxAmount`); // 2026-08-10, same pre-filled-suggestion pattern as shiftSales.salesTax
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

    const values = { salesAmount, commissionFee, netAmount, tipAmountPlatformCourier, tipAmountRestaurantDelivery, taxAmount };
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

/** Wage adjustments (2026-08-10) — optional per-employee override + extra
 * pay for shift-coverage situations, PLUS disciplinary/correction
 * deductions (added later same day, same row/timing/trust level — see
 * shiftWageAdjustments' schema comment). Trust-the-rendered-form pattern
 * again: scan for whichever employeeIds actually have inputs
 * (loadClosingReportData renders one row per roster employee), no need to
 * re-derive who's on the roster here. Fields:
 *   - wageOverride_<employeeId>: blank = null (use auto wage), else replaces it.
 *   - extraPay_<employeeId>: blank/0 = 0 (no extra pay), always additive.
 *   - wageReason_<employeeId>: optional free-text note, blank = null.
 *   - deduction_<employeeId>: blank/0 = 0 (no deduction), always subtractive.
 *   - deductionReason_<employeeId>: optional free-text note, blank = null.
 * Skips writing a row at all if every amount is blank/0 and there's no
 * existing row, so a shift with no adjustments doesn't accumulate empty
 * rows. A negative deduction amount is treated as invalid input (skipped,
 * same as NaN) — the field is meant to hold a positive dollar amount to
 * subtract, not a signed delta. */
async function upsertWageAdjustments(shiftId: number, formData: FormData) {
  const employeeIds = new Set<number>();
  for (const key of formData.keys()) {
    const match = /^(?:wageOverride|extraPay|wageReason|deduction|deductionReason)_(\d+)$/.exec(key);
    if (match) employeeIds.add(Number(match[1]));
  }

  for (const employeeId of employeeIds) {
    const overrideRaw = String(formData.get(`wageOverride_${employeeId}`) ?? "").trim();
    const extraRaw = String(formData.get(`extraPay_${employeeId}`) ?? "").trim();
    const reasonRaw = String(formData.get(`wageReason_${employeeId}`) ?? "").trim();
    const deductionRaw = String(formData.get(`deduction_${employeeId}`) ?? "").trim();
    const deductionReasonRaw = String(formData.get(`deductionReason_${employeeId}`) ?? "").trim();

    const wageOverrideAmount = overrideRaw === "" ? null : Number(overrideRaw);
    if (wageOverrideAmount != null && Number.isNaN(wageOverrideAmount)) continue;
    const extraPayAmount = extraRaw === "" ? 0 : Number(extraRaw);
    if (Number.isNaN(extraPayAmount)) continue;
    const reason = reasonRaw === "" ? null : reasonRaw;
    const deductionAmount = deductionRaw === "" ? 0 : Number(deductionRaw);
    if (Number.isNaN(deductionAmount) || deductionAmount < 0) continue;
    const deductionReason = deductionReasonRaw === "" ? null : deductionReasonRaw;

    const [existing] = await db
      .select()
      .from(shiftWageAdjustments)
      .where(and(eq(shiftWageAdjustments.shiftId, shiftId), eq(shiftWageAdjustments.employeeId, employeeId)));

    if (
      !existing &&
      wageOverrideAmount === null &&
      extraPayAmount === 0 &&
      reason === null &&
      deductionAmount === 0 &&
      deductionReason === null
    )
      continue;

    if (existing) {
      await db
        .update(shiftWageAdjustments)
        .set({ wageOverrideAmount, extraPayAmount, reason, deductionAmount, deductionReason })
        .where(eq(shiftWageAdjustments.id, existing.id));
    } else {
      await db
        .insert(shiftWageAdjustments)
        .values({ shiftId, employeeId, wageOverrideAmount, extraPayAmount, reason, deductionAmount, deductionReason });
    }
  }
}

/** The actual write step — computes via the shared helper (same one the
 * Preview page uses) and writes the locked snapshot. Chosen deliberately
 * over recompute-on-view for the Summary Report: a closing report is a
 * historical record and shouldn't silently change if settings (deduction
 * rate, split method, point values) change later. */
async function runFinalize(shiftId: number) {
  // Compute + write both now live in finalizeShiftWrites.ts (2026-08-10) —
  // shared with db/seed.ts, which needs to finalize a whole week of test
  // shifts at once. See that file's header comment.
  await finalizeShiftWrites(shiftId);
}

async function assertDraft(shiftId: number) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) throw new Error("Shift not found");
  if (shift.status === "finalized") {
    throw new Error("This shift is already finalized and locked — view the Summary Report instead.");
  }
}
