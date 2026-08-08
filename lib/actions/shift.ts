"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftRosterEntries, shiftSales, onlinePlatformSalesRecords,
  onlinePlatforms, restaurantSettings, tipPoolCalculations, employeePayouts,
} from "@/db/schema";
import { loadShiftCalcData } from "@/lib/shift/loadRosterForCalc";
import { buildFinalizationResult, type FinalizeRosterRow } from "@/lib/calc/finalizeShift";

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

/** Upserts the one ShiftSales row + all four OnlinePlatformSalesRecord rows
 * for a shift in one submit — this is the "closing report" sales entry. */
export async function saveClosingReportSales(formData: FormData) {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) throw new Error("Missing shift id");

  await assertDraft(shiftId);
  await upsertClosingReportSales(shiftId, formData);

  revalidatePath(`/shifts/${shiftId}/closing-report`);
}

/** "Save & Finalize" from the closing report form — persists whatever's in
 * the form fields right now, THEN runs the same finalize/lock logic as
 * finalizeShift below, in one submit (so the manager doesn't have to click
 * Save first and Finalize second). */
export async function saveClosingReportAndFinalize(formData: FormData) {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) throw new Error("Missing shift id");

  await assertDraft(shiftId);
  await upsertClosingReportSales(shiftId, formData);
  await runFinalize(shiftId);

  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/summary`);
}

async function upsertClosingReportSales(shiftId: number, formData: FormData) {
  await upsertPointOverrides(shiftId, formData);

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

/** "Save" — computes the real tip-pool + wage payout from whatever's been
 * entered so far, writes it as a locked snapshot (TipPoolCalculation +
 * EmployeePayout), and marks the shift finalized. Chosen deliberately over
 * recompute-on-view: a closing report is a historical record and shouldn't
 * silently change if settings (deduction rate, point values) change later. */
export async function finalizeShift(formData: FormData) {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) throw new Error("Missing shift id");

  await assertDraft(shiftId);
  await runFinalize(shiftId);

  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/summary`);
}

async function runFinalize(shiftId: number) {
  const calcData = await loadShiftCalcData(shiftId);
  if (!calcData.shift) throw new Error("Shift not found");
  if (calcData.roster.length === 0) throw new Error("Add at least one person to the roster before saving");

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  if (!sales) throw new Error("Enter closing report sales figures before saving");

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const deductionRate = settings?.ccTipDeductionRate ?? 0;

  const platformRecords = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const platformCourierTips = round2(sum(platformRecords.map((r) => r.tipAmountPlatformCourier)));
  const platformDeliveryTips = round2(sum(platformRecords.map((r) => r.tipAmountRestaurantDelivery)));

  const roster: FinalizeRosterRow[] = calcData.roster.map((r) => ({
    employeeId: r.employeeId,
    tipPoolGroups: r.tipPoolGroups,
    pointValue: r.pointValue,
    flatWage: r.flatWage,
  }));

  const result = buildFinalizationResult({
    deductionRate,
    grossCcTip: sales.ccTipTotal,
    takeoutCcTip: sales.takeoutCcTip,
    deliveryToastTip: sales.deliveryToastTip,
    platformCourierTips,
    platformDeliveryTips,
    roster,
  });

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

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
