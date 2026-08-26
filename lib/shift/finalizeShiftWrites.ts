/**
 * The write half of finalizing a shift — pulled out of lib/actions/shift.ts
 * (2026-08-10) so it has exactly one source of truth. Originally only the
 * real "Confirm & Finalize" server action called this; now db/seed.ts also
 * needs to finalize a whole week of shifts at once for realistic test
 * data (see PROGRESS.md), and duplicating this write logic in two places
 * risked them drifting — the calc engine itself (computeFinalizationPreview)
 * was already shared, this closes the gap on the write side too.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, tipPoolCalculations, employeePayouts, incentivePayoutRecords } from "@/db/schema";
import { computeFinalizationPreview } from "./computeFinalizationPreview";

/** Computes (via the shared calc engine) and writes the locked snapshot
 * for one shift: TipPoolCalculation, one EmployeePayout row per roster
 * employee, one IncentivePayoutRecord per fired rule, and flips the
 * shift's status to finalized. Does NOT check whether the shift is
 * already a draft — callers (the real action, the seed script) are
 * responsible for that; this function only handles compute + write. */
/** finalizedByEmployeeId: who pressed Confirm & finalize (2026-08-26) --
 * shown on the Summary and the key to the reopen rule. Optional so
 * db/seed.ts keeps working; seeded shifts show an em dash. */
export async function finalizeShiftWrites(shiftId: number, finalizedByEmployeeId?: number) {
  const { result, incentiveRulePayouts, sales } = await computeFinalizationPreview(shiftId);

  await db.insert(tipPoolCalculations).values({ shiftId, ...result.tipPoolCalculation });
  for (const payout of result.employeePayouts) {
    await db.insert(employeePayouts).values({ shiftId, ...payout });
  }

  for (const rulePayout of incentiveRulePayouts) {
    await db.insert(incentivePayoutRecords).values({
      ruleId: rulePayout.ruleId,
      employeeId: rulePayout.employeeId,
      periodType: "SHIFT",
      periodKey: String(shiftId),
      computedAmount: rulePayout.amount,
      metricSnapshot: { total_sales: sales.totalSales },
    });
  }

  await db
    .update(shifts)
    .set({ status: "finalized", finalizedAt: new Date().toISOString(), finalizedByEmployeeId: finalizedByEmployeeId ?? null })
    .where(eq(shifts.id, shiftId));

  return result;
}
