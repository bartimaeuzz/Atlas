"use server";

/** Payroll (2026-08-17) — weekly payroll register, built entirely from
 * Atlas's own already-computed shift payouts. See db/schema.ts's
 * payrollPeriods comment and lib/payroll/loadPayrollRegister.ts for the
 * full draft/paid design. Confirmed with Oliver before building:
 * finalized-shifts-only data source, a lock/mark-as-paid step (same
 * printed→paid lifecycle Supplier Check/Card already use), and a
 * 3-sheet export (check-printing list, per-employee pay-stub detail,
 * bilingual wage acknowledgment). */

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { payrollPeriods, payrollPeriodEmployeeTotals } from "@/db/schema";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { verifySecondPerson } from "@/lib/permissions/secondPerson";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { datesInWeek } from "@/lib/schedule/weekMath";
import { computeLivePayrollRegister } from "@/lib/payroll/loadPayrollRegister";

/** 2026-08-17 security audit finding #2 (MAJOR) — markPayrollPeriodPaid
 * originally only checked "is anyone logged in," not "is this a
 * manager," even though /payroll itself is manager-gated and its
 * sibling revertPayrollPeriodToDraft below correctly required ADMIN. A
 * STAFF-only session (e.g. someone who only ever logs in for My
 * Schedule) could otherwise lock a week's payroll as paid by calling
 * this action directly. Closed same day with a MANAGER/ADMIN gate.
 *
 * 2026-08-21 (Phase B, part 2) — both functions below now check the
 * real FA_PAYROLL_LOCK_FINALIZE capability (registry label "Payroll:
 * lock & finalize," Admin-only by default) instead of the coarse
 * MANAGER/ADMIN or hardcoded-ADMIN checks, now that Oliver has
 * confirmed Aey holds the Financial Auditor tier ("aey hold it").
 * revertPayrollPeriodToDraft is included under the same capability
 * (not left ADMIN-only) because "lock & finalize" naturally includes
 * correcting a mistake in what you locked — whoever can finalize a
 * period should be able to unlock it to fix an error, matching the
 * symmetry the Financial Auditor tier is meant to grant. Confirmed
 * safe to wire: unlike the FA_LEDGER_CARD_* / FA_SUPPLIER_CHECK_* items
 * left unwired in card.ts/supplierCheck.ts, both functions here map
 * 1:1 onto this one capability with no ambiguity about which action(s)
 * it should gate. */
/** `secondPin` is only consulted when Settings has the two-person payroll
 * control switched ON (2026-09-01). While it is off — the state the
 * restaurant starts in, because four co-owners with one of them holding
 * the finance work cannot always find a second person — one person
 * finalizes alone and the period is stamped `singlePerson` so the record
 * never later pretends two people signed it. */
export async function markPayrollPeriodPaid(weekStartDate: string, secondPin?: string): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("FA_PAYROLL_LOCK_FINALIZE");

    // Everything that can refuse runs BEFORE the first write — locking a
    // payroll week is several writes and a half-applied one is exactly the
    // damage this ordering exists to prevent.
    const settings = await loadRestaurantSettings();
    const twoPerson = settings.requireTwoPersonPayroll;
    if (twoPerson) {
      const problem = await verifySecondPerson("FA_PAYROLL_LOCK_FINALIZE", session.id, secondPin ?? "");
      if (problem) throw new Error(problem);
    }

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
        .set({ status: "paid", paidAt, paidByEmployeeId: session.id, weekEndDate, singlePerson: !twoPerson })
        .where(eq(payrollPeriods.id, existing.id));
      periodId = existing.id;
      // Correction re-run (e.g. after an ADMIN reverted to draft) — clear
      // any old snapshot rows before writing the fresh ones.
      await db.delete(payrollPeriodEmployeeTotals).where(eq(payrollPeriodEmployeeTotals.payrollPeriodId, periodId));
    } else {
      const [inserted] = await db
        .insert(payrollPeriods)
        .values({ weekStartDate, weekEndDate, status: "paid", paidAt, paidByEmployeeId: session.id, singlePerson: !twoPerson })
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
});
}

/** Reverts a paid week back to draft so it can be corrected and
 * re-marked paid — see the 2026-08-21 (Phase B, part 2) header comment
 * above for why this now shares FA_PAYROLL_LOCK_FINALIZE with
 * markPayrollPeriodPaid instead of staying hardcoded to ADMIN. Deletes
 * the locked snapshot; the week goes back to showing live numbers until
 * marked paid again. */
export async function revertPayrollPeriodToDraft(weekStartDate: string): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireCapability("FA_PAYROLL_LOCK_FINALIZE");

    const [existing] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.weekStartDate, weekStartDate));
    if (!existing || existing.status !== "paid") return;

    await db.delete(payrollPeriodEmployeeTotals).where(eq(payrollPeriodEmployeeTotals.payrollPeriodId, existing.id));
    await db
      .update(payrollPeriods)
      .set({ status: "draft", paidAt: null, paidByEmployeeId: null })
      .where(eq(payrollPeriods.id, existing.id));

    revalidatePath("/payroll");
});
}
