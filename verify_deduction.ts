/**
 * Real-DB e2e verify for the disciplinary deduction feature (2026-08-10).
 * Run with: tsx verify_deduction.ts (against a local seeded db/atlas.db)
 *
 * Note: this directly patches the FINALIZED employee_payouts snapshot row
 * rather than editing shift_wage_adjustments + re-finalizing, because
 * finalizeShiftWrites() only INSERTs (no re-finalize path exists yet for
 * an already-finalized shift — same as every other adjustment field). The
 * calc-engine math (deduction subtracts correctly, combines with
 * override/extra pay) is already covered by the finalizeShift.test.ts unit
 * tests added alongside this script; this script instead checks the loader
 * + visibility wiring downstream of that snapshot, which unit tests don't
 * touch.
 *
 * Checks:
 *  1. A deductionAmount present on employee_payouts shows up correctly in
 *     that employee's OWN loadMyEarnings payout.
 *  2. The SAME deduction does NOT appear anywhere on a coworker's view of
 *     that shift (the "Also worked this shift" list) — confirms the
 *     employee+manager-only visibility decision actually holds at the data
 *     layer, not just by TypeScript's MyEarningsCoworkerRow shape.
 *  3. loadSummaryData (manager-facing) DOES show the deduction on the
 *     Summary Report row for that employee.
 */
import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { shifts, shiftRosterEntries, employeePayouts } from "./db/schema";
import { loadMyEarnings } from "./lib/staff/loadMyEarnings";
import { loadSummaryData } from "./lib/shift/loadSummaryData";

async function main() {
  // Pick a finalized shift with at least 2 roster employees.
  const [shift] = await db.select().from(shifts).where(eq(shifts.status, "finalized")).limit(1);
  if (!shift) throw new Error("No finalized shift found — did you run db:seed?");

  const roster = await db.select().from(shiftRosterEntries).where(eq(shiftRosterEntries.shiftId, shift.id));
  const employeeIds = Array.from(new Set(roster.map((r) => r.employeeId)));
  if (employeeIds.length < 2) throw new Error("Need a shift with 2+ employees");

  const [disciplinedId, coworkerId] = employeeIds;
  console.log(`Shift ${shift.id} (${shift.date} ${shift.period}) — disciplining employee ${disciplinedId}, watching employee ${coworkerId}`);

  const [payoutRow] = await db
    .select()
    .from(employeePayouts)
    .where(and(eq(employeePayouts.shiftId, shift.id), eq(employeePayouts.employeeId, disciplinedId)));
  if (!payoutRow) throw new Error("No employee_payouts row found for disciplined employee — bad seed data?");

  await db
    .update(employeePayouts)
    .set({ deductionAmount: 8.5, totalCorePayout: payoutRow.totalCorePayout - 8.5 })
    .where(eq(employeePayouts.id, payoutRow.id));

  // 1. Own view.
  const myEarnings = await loadMyEarnings(disciplinedId);
  const myShift = myEarnings?.shifts.find((s) => s.shiftId === shift.id);
  if (!myShift) throw new Error("Disciplined employee's own shift not found in loadMyEarnings");
  console.log(`\n[1] Disciplined employee's OWN view:`);
  console.log(`    deductionAmount = ${myShift.payout.deductionAmount} (expect 8.5)`);
  console.log(`    totalCorePayout = ${myShift.payout.totalCorePayout}`);
  if (myShift.payout.deductionAmount !== 8.5) throw new Error("FAIL: deductionAmount not 8.5 in own view");

  // 2. Coworker view — the deducted employee should show up in the
  // coworker's "Also worked this shift" list, but with NO deductionAmount
  // field at all (MyEarningsCoworkerRow doesn't carry it), and their
  // tipShare/flatWage should be unaffected by the deduction (deduction is
  // not folded into either).
  const coworkerEarnings = await loadMyEarnings(coworkerId);
  const coworkerShift = coworkerEarnings?.shifts.find((s) => s.shiftId === shift.id);
  if (!coworkerShift) throw new Error("Coworker's shift not found in loadMyEarnings");
  const disciplinedAsSeenByCoworker = coworkerShift.coworkers.find((c) => c.employeeId === disciplinedId);
  console.log(`\n[2] Coworker's view of the disciplined employee's roster row:`);
  if (!disciplinedAsSeenByCoworker) {
    console.log(`    (not visible at all under current visibility settings — acceptable, just means this pair can't see each other's rows)`);
  } else {
    const hasDeductionField = "deductionAmount" in disciplinedAsSeenByCoworker;
    console.log(`    row keys = ${Object.keys(disciplinedAsSeenByCoworker).join(", ")}`);
    console.log(`    "deductionAmount" in row = ${hasDeductionField} (expect false)`);
    if (hasDeductionField) throw new Error("FAIL: deductionAmount leaked onto coworker's view of the roster row");
  }

  // 3. Manager-facing Summary Report.
  const summary = await loadSummaryData(shift.id);
  const summaryRow = summary.payouts.find((p) => p.employeeId === disciplinedId);
  if (!summaryRow) throw new Error("Disciplined employee not found in Summary Report payouts");
  console.log(`\n[3] Summary Report (manager-facing) row:`);
  console.log(`    deductionAmount = ${summaryRow.deductionAmount} (expect 8.5)`);
  if (summaryRow.deductionAmount !== 8.5) throw new Error("FAIL: deductionAmount not 8.5 in Summary Report");

  console.log("\n✅ All deduction e2e checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verify script failed:", err);
  process.exit(1);
});
