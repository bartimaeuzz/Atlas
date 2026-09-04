/**
 * Computed payroll (labor) cost for the Analytics/P&L page (2026-08-16).
 * Confirmed with Oliver: Atlas's OWN computed shift-wage data is the
 * P&L's payroll source of truth, not the legacy PAYROLL BOH/PAYROLL FOH
 * ledger categories (see ledgerCategories' schema comment and
 * loadExpenseBreakdown.ts's header) -- this avoids double-counting and
 * is automatic instead of relying on someone re-logging payroll by hand.
 *
 * "Labor cost" here means real employer spend, NOT tips: flatWageAmount
 * (regular wage) + extraPayAmount (ad hoc coverage pay) + incentiveAmount
 * (bonus engine payouts) - deductionAmount (disciplinary deductions).
 * tipPoolShare/hostUpsellTipShare are deliberately excluded -- those are
 * pass-through from customers, not a restaurant expense (see
 * finalizeShift.ts's own totalTip/totalCorePayout split for the
 * precedent this follows).
 *
 * Only `status="finalized"` shifts count, same rule every other report
 * in this app uses (draft shifts haven't had their numbers signed off
 * yet). FOH/BOH split reuses the same "representative position per
 * (shift, employee)" logic loadSummaryData.ts already uses for a single
 * shift's summary page -- prefers the employee's primaryPositionId if
 * they worked it that shift, else falls back to their first roster row.
 */
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { employeePayouts, shifts, shiftRosterEntries, positions, employees } from "@/db/schema";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

/** The one definition of employer labor spend for one payout row, exported
 * so the schedule's per-day labor % (lib/analytics/loadDailyLabor.ts) reads
 * the same money rule as the P&L instead of restating it. Restating it is
 * exactly how two screens end up disagreeing about the same day. */
export function laborCostOfPayout(p: {
  flatWageAmount: number;
  extraPayAmount: number;
  incentiveAmount: number;
  deductionAmount: number;
}): number {
  return p.flatWageAmount + p.extraPayAmount + p.incentiveAmount - p.deductionAmount;
}

export interface PayrollCostBreakdown {
  dateFrom: string;
  dateTo: string;
  total: number;
  foh: number;
  boh: number;
}

export async function loadPayrollCost(dateFrom: string, dateTo: string): Promise<PayrollCostBreakdown> {
  const payoutRows = await db
    .select({
      shiftId: employeePayouts.shiftId,
      employeeId: employeePayouts.employeeId,
      flatWageAmount: employeePayouts.flatWageAmount,
      extraPayAmount: employeePayouts.extraPayAmount,
      incentiveAmount: employeePayouts.incentiveAmount,
      deductionAmount: employeePayouts.deductionAmount,
    })
    .from(employeePayouts)
    .innerJoin(shifts, eq(employeePayouts.shiftId, shifts.id))
    .where(and(eq(shifts.status, "finalized"), gte(shifts.date, dateFrom), lte(shifts.date, dateTo)));

  if (payoutRows.length === 0) {
    return { dateFrom, dateTo, total: 0, foh: 0, boh: 0 };
  }

  const shiftIds = [...new Set(payoutRows.map((p) => p.shiftId))];
  const rosterRows = await db
    .select({
      shiftId: shiftRosterEntries.shiftId,
      employeeId: shiftRosterEntries.employeeId,
      positionId: shiftRosterEntries.positionId,
      positionCategory: positions.category,
      primaryPositionId: employees.primaryPositionId,
    })
    .from(shiftRosterEntries)
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .where(inArray(shiftRosterEntries.shiftId, shiftIds));

  const rosterByShiftEmployee = new Map<string, typeof rosterRows>();
  for (const r of rosterRows) {
    const key = `${r.shiftId}:${r.employeeId}`;
    const list = rosterByShiftEmployee.get(key) ?? [];
    list.push(r);
    rosterByShiftEmployee.set(key, list);
  }
  const categoryByShiftEmployee = new Map<string, "FOH" | "BOH">();
  for (const [key, rows] of rosterByShiftEmployee) {
    const representative = rows.find((r) => r.positionId === r.primaryPositionId) ?? rows[0];
    categoryByShiftEmployee.set(key, representative.positionCategory as "FOH" | "BOH");
  }

  let foh = 0;
  let boh = 0;
  for (const p of payoutRows) {
    const laborCost = laborCostOfPayout(p);
    const category = categoryByShiftEmployee.get(`${p.shiftId}:${p.employeeId}`) ?? "FOH"; // same fallback as loadSummaryData.ts
    if (category === "BOH") boh += laborCost;
    else foh += laborCost;
  }

  foh = round2(foh);
  boh = round2(boh);
  return { dateFrom, dateTo, total: round2(foh + boh), foh, boh };
}
