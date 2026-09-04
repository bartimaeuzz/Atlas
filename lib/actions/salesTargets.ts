"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { salesTargetDates, salesTargetWeekdays } from "@/db/schema";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";

/** EDIT_SETTINGS, the same gate the labor-cost target already sits behind
 * in lib/actions/settings.ts — a sales target is a settings-shaped number
 * the partners agree once, not a per-shift entry. */
const CAPABILITY = "EDIT_SETTINGS" as const;
const RESTAURANT_ID = 1;

/** Every failure below is RETURNED, never thrown: a thrown Error out of a
 * server action reaches production as "Minified React error #441", so a
 * sentence written for a manager arrives as garbage. See
 * lib/actions/actionResult.ts for the incident this convention came from. */

const MAX_TARGET = 1_000_000;

function parseAmount(raw: string, what: string): number {
  // Managers type "$3,800" and "3,800" as readily as "3800", and rejecting
  // those would be an error message where error prevention was available.
  const cleaned = raw.replace(/[$,\s]/g, "");
  const amount = Number(cleaned);
  if (cleaned === "" || Number.isNaN(amount)) {
    throw new Error(`${what} must be a number, for example 3800.`);
  }
  if (amount <= 0) {
    throw new Error(`${what} must be more than zero. Leave it blank to have no target instead.`);
  }
  if (amount > MAX_TARGET) {
    throw new Error(`${what} looks wrong — it is above $1,000,000. Check the number.`);
  }
  return Math.round(amount * 100) / 100;
}

function assertIsoDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Pick a date first.");
  // Round-tripping catches "2026-02-31", which the pattern above happily
  // accepts and Date silently rolls forward to 3 March.
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new Error("That date does not exist. Check the day and month.");
  }
  return raw;
}

export interface SalesTargetsState extends ActionResult {
  /** Nonce for the button's "Saved" flash — a nonce and not a boolean so
   * two saves in a row both flash. Same shape as SettingsActionState. */
  savedAt?: number;
}

/** The seven weekday defaults, replaced as a set. A blank box CLEARS that
 * weekday rather than storing 0: a stored 0 would mark every Monday as
 * missed by its whole day's sales, which is the loud wrong answer. Same
 * null-means-nobody-set-this convention as laborCostTargetPct. */
export async function saveWeekdaySalesTargets(
  _prev: SalesTargetsState,
  formData: FormData
): Promise<SalesTargetsState> {
  const result = await asActionResult(async () => {
    await requireCapability(CAPABILITY);

    const writes: { dayOfWeek: number; netSalesTarget: number }[] = [];
    const clears: number[] = [];
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      const raw = String(formData.get(`weekday-${dayOfWeek}`) ?? "").trim();
      if (raw === "") {
        clears.push(dayOfWeek);
        continue;
      }
      writes.push({ dayOfWeek, netSalesTarget: parseAmount(raw, "Each day's target") });
    }

    // Validation for all seven finished above, so a bad Thursday cannot
    // leave Monday to Wednesday already written and the rest not.
    const statements = [
      ...clears.map((dayOfWeek) =>
        db
          .delete(salesTargetWeekdays)
          .where(
            and(
              eq(salesTargetWeekdays.restaurantId, RESTAURANT_ID),
              eq(salesTargetWeekdays.dayOfWeek, dayOfWeek)
            )
          )
      ),
      ...writes.map((w) =>
        db
          .insert(salesTargetWeekdays)
          .values({ restaurantId: RESTAURANT_ID, ...w })
          .onConflictDoUpdate({
            target: [salesTargetWeekdays.restaurantId, salesTargetWeekdays.dayOfWeek],
            set: { netSalesTarget: w.netSalesTarget },
          })
      ),
    ];
    // One trip, all-or-nothing — the seven weekdays are one decision from
    // one meeting and must not land half-applied. Destructured rather than
    // cast because db.batch's type wants a non-empty tuple and this is the
    // shape that proves it without an assertion.
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);

    revalidatePath("/settings/sales-targets");
    revalidatePath("/schedule/plan");
  });

  return result.error ? { error: result.error } : { error: null, savedAt: Date.now() };
}

/** One date's override, added or replaced. Kept a separate action from the
 * weekday form so adding a holiday cannot silently rewrite the seven
 * defaults, and so each form has one obviously-correct button. */
export async function saveSalesTargetOverride(
  _prev: SalesTargetsState,
  formData: FormData
): Promise<SalesTargetsState> {
  const result = await asActionResult(async () => {
    await requireCapability(CAPABILITY);

    const date = assertIsoDate(String(formData.get("date") ?? "").trim());
    const netSalesTarget = parseAmount(String(formData.get("amount") ?? "").trim(), "The target");
    const labelRaw = String(formData.get("label") ?? "").trim();
    if (labelRaw.length > 40) throw new Error("Keep the reason to 40 characters or fewer.");
    const label = labelRaw === "" ? null : labelRaw;

    await db
      .insert(salesTargetDates)
      .values({ restaurantId: RESTAURANT_ID, date, netSalesTarget, label })
      .onConflictDoUpdate({
        target: [salesTargetDates.restaurantId, salesTargetDates.date],
        set: { netSalesTarget, label },
      });

    revalidatePath("/settings/sales-targets");
    revalidatePath("/schedule/plan");
  });

  return result.error ? { error: result.error } : { error: null, savedAt: Date.now() };
}

/** Removing an override falls back to that day's weekday default — it does
 * not leave the date with no target. */
export async function deleteSalesTargetOverride(
  _prev: SalesTargetsState,
  formData: FormData
): Promise<SalesTargetsState> {
  const result = await asActionResult(async () => {
    await requireCapability(CAPABILITY);
    const date = assertIsoDate(String(formData.get("date") ?? "").trim());
    await db
      .delete(salesTargetDates)
      .where(and(eq(salesTargetDates.restaurantId, RESTAURANT_ID), eq(salesTargetDates.date, date)));
    revalidatePath("/settings/sales-targets");
    revalidatePath("/schedule/plan");
  });

  return result.error ? { error: result.error } : { error: null, savedAt: Date.now() };
}
