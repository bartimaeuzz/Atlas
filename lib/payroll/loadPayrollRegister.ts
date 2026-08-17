/**
 * Payroll register (2026-08-17) — one Monday-Sunday week's worth of
 * what every employee is owed, built entirely from Atlas's own already-
 * computed shift payouts (employeePayouts.totalCorePayout and its
 * component columns), never re-derived. See db/schema.ts's
 * payrollPeriods comment for the full draft/paid design.
 *
 * `computeLivePayrollRegister` is the single source of truth for the
 * live numbers — used both by this loader (to show a draft week) and by
 * markPayrollPeriodPaid (to snapshot a paid week), same "compute vs.
 * write" separation already used by computeFinalizationPreview.ts, so
 * the preview a manager sees can never drift from what actually gets
 * locked in.
 */
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  employeePayouts,
  employees,
  shifts,
  payrollPeriods,
  payrollPeriodEmployeeTotals,
} from "@/db/schema";
import { datesInWeek } from "@/lib/schedule/weekMath";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export interface PayrollRegisterRow {
  employeeId: number;
  employeeName: string;
  shiftCount: number;
  flatWageAmount: number;
  extraPayAmount: number;
  incentiveAmount: number;
  deductionAmount: number;
  tipPoolShare: number;
  hostUpsellTipShare: number;
  totalTip: number;
  totalCorePayout: number;
}

export interface PayrollRegister {
  weekStartDate: string;
  weekEndDate: string;
  status: "draft" | "paid";
  paidAt: string | null;
  paidByName: string | null;
  rows: PayrollRegisterRow[];
  total: number;
  /** Shifts that exist in this week (roster/sales was entered) but
   * aren't finalized yet — a week can't be marked paid while this is
   * nonzero, same "source data must be locked first" rule Ledger/Card
   * already enforce. */
  unfinalizedShiftCount: number;
  canMarkPaid: boolean;
}

/** Always computes fresh from employeePayouts — used for a draft week's
 * live view AND as the exact numbers snapshotted when a week is marked
 * paid. Deliberately ignores any existing payrollPeriods row so callers
 * can always see "what would this look like right now." */
export async function computeLivePayrollRegister(
  weekStartDate: string,
  weekEndDate: string
): Promise<{ rows: PayrollRegisterRow[]; unfinalizedShiftCount: number }> {
  const shiftsInWeek = await db
    .select({ id: shifts.id, status: shifts.status })
    .from(shifts)
    .where(and(gte(shifts.date, weekStartDate), lte(shifts.date, weekEndDate)));

  const unfinalizedShiftCount = shiftsInWeek.filter((s) => s.status !== "finalized").length;
  const finalizedShiftIds = shiftsInWeek.filter((s) => s.status === "finalized").map((s) => s.id);

  if (finalizedShiftIds.length === 0) {
    return { rows: [], unfinalizedShiftCount };
  }

  const payoutRows = await db
    .select({
      employeeId: employeePayouts.employeeId,
      employeeName: employees.name,
      flatWageAmount: employeePayouts.flatWageAmount,
      extraPayAmount: employeePayouts.extraPayAmount,
      incentiveAmount: employeePayouts.incentiveAmount,
      deductionAmount: employeePayouts.deductionAmount,
      tipPoolShare: employeePayouts.tipPoolShare,
      hostUpsellTipShare: employeePayouts.hostUpsellTipShare,
      totalTip: employeePayouts.totalTip,
      totalCorePayout: employeePayouts.totalCorePayout,
    })
    .from(employeePayouts)
    .innerJoin(employees, eq(employeePayouts.employeeId, employees.id))
    .where(inArray(employeePayouts.shiftId, finalizedShiftIds));

  const byEmployee = new Map<number, PayrollRegisterRow>();
  for (const p of payoutRows) {
    const existing = byEmployee.get(p.employeeId);
    const hostUpsell = p.hostUpsellTipShare ?? 0;
    if (existing) {
      existing.shiftCount += 1;
      existing.flatWageAmount += p.flatWageAmount;
      existing.extraPayAmount += p.extraPayAmount;
      existing.incentiveAmount += p.incentiveAmount;
      existing.deductionAmount += p.deductionAmount;
      existing.tipPoolShare += p.tipPoolShare;
      existing.hostUpsellTipShare += hostUpsell;
      existing.totalTip += p.totalTip;
      existing.totalCorePayout += p.totalCorePayout;
    } else {
      byEmployee.set(p.employeeId, {
        employeeId: p.employeeId,
        employeeName: p.employeeName,
        shiftCount: 1,
        flatWageAmount: p.flatWageAmount,
        extraPayAmount: p.extraPayAmount,
        incentiveAmount: p.incentiveAmount,
        deductionAmount: p.deductionAmount,
        tipPoolShare: p.tipPoolShare,
        hostUpsellTipShare: hostUpsell,
        totalTip: p.totalTip,
        totalCorePayout: p.totalCorePayout,
      });
    }
  }

  const rows = [...byEmployee.values()]
    .map((r) => ({
      ...r,
      flatWageAmount: round2(r.flatWageAmount),
      extraPayAmount: round2(r.extraPayAmount),
      incentiveAmount: round2(r.incentiveAmount),
      deductionAmount: round2(r.deductionAmount),
      tipPoolShare: round2(r.tipPoolShare),
      hostUpsellTipShare: round2(r.hostUpsellTipShare),
      totalTip: round2(r.totalTip),
      totalCorePayout: round2(r.totalCorePayout),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { rows, unfinalizedShiftCount };
}

export async function loadPayrollRegister(weekStartDate: string): Promise<PayrollRegister> {
  const weekEndDate = datesInWeek(weekStartDate)[6];

  const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.weekStartDate, weekStartDate));

  if (period && period.status === "paid") {
    const snapshotRows = await db
      .select({
        employeeId: payrollPeriodEmployeeTotals.employeeId,
        employeeName: employees.name,
        shiftCount: payrollPeriodEmployeeTotals.shiftCount,
        flatWageAmount: payrollPeriodEmployeeTotals.flatWageAmount,
        extraPayAmount: payrollPeriodEmployeeTotals.extraPayAmount,
        incentiveAmount: payrollPeriodEmployeeTotals.incentiveAmount,
        deductionAmount: payrollPeriodEmployeeTotals.deductionAmount,
        tipPoolShare: payrollPeriodEmployeeTotals.tipPoolShare,
        hostUpsellTipShare: payrollPeriodEmployeeTotals.hostUpsellTipShare,
        totalTip: payrollPeriodEmployeeTotals.totalTip,
        totalCorePayout: payrollPeriodEmployeeTotals.totalCorePayout,
      })
      .from(payrollPeriodEmployeeTotals)
      .innerJoin(employees, eq(payrollPeriodEmployeeTotals.employeeId, employees.id))
      .where(eq(payrollPeriodEmployeeTotals.payrollPeriodId, period.id))
      .orderBy(employees.name);

    let paidByName: string | null = null;
    if (period.paidByEmployeeId) {
      const [payer] = await db.select({ name: employees.name }).from(employees).where(eq(employees.id, period.paidByEmployeeId));
      paidByName = payer?.name ?? null;
    }

    const total = round2(snapshotRows.reduce((sum, r) => sum + r.totalCorePayout, 0));
    return {
      weekStartDate,
      weekEndDate,
      status: "paid",
      paidAt: period.paidAt,
      paidByName,
      rows: snapshotRows,
      total,
      unfinalizedShiftCount: 0,
      canMarkPaid: false,
    };
  }

  const { rows, unfinalizedShiftCount } = await computeLivePayrollRegister(weekStartDate, weekEndDate);
  const total = round2(rows.reduce((sum, r) => sum + r.totalCorePayout, 0));

  return {
    weekStartDate,
    weekEndDate,
    status: "draft",
    paidAt: null,
    paidByName: null,
    rows,
    total,
    unfinalizedShiftCount,
    canMarkPaid: rows.length > 0 && unfinalizedShiftCount === 0,
  };
}
