"use server";

/** Payroll (2026-08-17) — weekly payroll register, built entirely from
 * Atlas's own already-computed shift payouts. See db/schema.ts's
 * payrollPeriods comment and lib/payroll/loadPayrollRegister.ts for the
 * full draft/paid design. Confirmed with Oliver before building:
 * finalized-shifts-only data source, a lock/mark-as-paid step (same
 * printed→paid lifecycle Supplier Check/Card already use), and a
 * 3-sheet export (check-printing list, per-employee pay-stub detail,
 * bilingual wage acknowledgment). */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payrollPeriods, payrollPeriodEmployeeTotals } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { datesInWeek } from "@/lib/schedule/weekMath";
import { computeLivePayrollRegister } from "@/lib/payroll/loadPayrollRegister";

/** Locks a week's payroll register. Blocked unless every shift that
 * exists in that week is already finalized (same "source data must be
 * locked first" rule Ledger/Card enforce) and there's at least one
 * employee to pay. Snapshots the exact live numbers at this moment into
 * payrollPeriodEmployeeTotals — a locked historical record that won't
 * silently change later if a shift is edited/refinalized. */
export async function markPayrollPeriodPaid(weekStartDate: string) {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const weekEndDate = datesInWeek(weekStartDate)[6];

  const [existing] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.weekStartDate, weekStartDate));
  if (existing?.status === "paid") {
    throw new Error("This week's payroll is already marked paid.");
  }

  const { rows, unfinalizedShiftCount } = await computeLivePayrollRegister(weekStartDate, weekEndDate);
  if (unfinalizedShiftCount > 0) {
    throw new Error(
      `${unfinalizedShiftCount} shift(s) this week aren't finalized yet — finalize every shift before marking payroll paid.`
    );
  }
  if (rows.length === 0) {
    throw new Error("Nothing to pay for this week yet — no finalized shifts with payouts.");
  }

  const paidAt = new Date().toISOString();
  let periodId: number;
  if (existing) {
    await db
      .update(payrollPeriods)
      .set({ status: "paid", paidAt, paidByEmployeeId: session.id, weekEndDate })
      .where(eq(payrollPeriods.id, existing.id));
    periodId = existing.id;
    // Correction re-run (e.g. after an ADMIN reverted to draft) — clear
    // any old snapshot rows before writing the fresh ones.
    await db.delete(payrollPeriodEmployeeTotals).where(eq(payrollPeriodEmployeeTotals.payrollPeriodId, periodId));
  } else {
    const [inserted] = await db
      .insert(payrollPeriods)
      .values({ weekStartDate, weekEndDate, status: "paid", paidAt, paidByEmployeeId: session.id })
      .returning({ id: payrollPeriods.id });
    periodId = inserted.id;
  }

  await db.insert(payrollPeriodEmployeeTotals).values(
    rows.map((r) => ({
      payrollPeriodId: periodId,
      employeeId: r.employeeId,
      shiftCount: r.shiftCount,
      flatWageAmount: r.flatWageAmount,
      extraPayAmount: r.extraPayAmount,
      incentiveAmount: r.incentiveAmount,
      deductionAmount: r.deductionAmount,
      tipPoolShare: r.tipPoolShare,
      hostUpsellTipShare: r.hostUpsellTipShare,
      totalTip: r.totalTip,
      totalCorePayout: r.totalCorePayout,
    }))
  );

  revalidatePath("/payroll");
}

/** Reverts a paid week back to draft so it can be corrected and
 * re-marked paid — ADMIN only, same override exception already used for
 * a finalized Ledger day / reconciled Card period / paid Supplier
 * Check. Deletes the locked snapshot; the week goes back to showing
 * live numbers until marked paid again. */
export async function revertPayrollPeriodToDraft(weekStartDate: string) {
  const session = await getCurrentStaffSession();
  if (!session || session.systemRole !== "ADMIN") {
    throw new Error("Only an Admin can revert a paid payroll week back to draft.");
  }

  const [existing] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.weekStartDate, weekStartDate));
  if (!existing || existing.status !== "paid") return;

  await db.delete(payrollPeriodEmployeeTotals).where(eq(payrollPeriodEmployeeTotals.payrollPeriodId, existing.id));
  await db
    .update(payrollPeriods)
    .set({ status: "draft", paidAt: null, paidByEmployeeId: null })
    .where(eq(payrollPeriods.id, existing.id));

  revalidatePath("/payroll");
}

