import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftSales, tipPoolCalculations, employeePayouts, employees,
  onlinePlatforms, onlinePlatformSalesRecords,
} from "@/db/schema";

export interface SummaryPayoutRow {
  employeeId: number;
  employeeName: string;
  pointValueUsed: number | null;
  tipPoolShare: number;
  flatWageAmount: number;
  /** Host cocktail/mocktail drink bonus, 0 if not applicable — already
   * included in totalCorePayout, shown separately for transparency. */
  hostUpsellTipShare: number;
  /** Ad hoc extra pay for shift coverage (2026-08-10), 0 if none — already
   * included in totalCorePayout, shown separately, never merged silently
   * into flatWageAmount. */
  extraPayAmount: number;
  totalCorePayout: number;
}

export interface SummaryData {
  shift: { id: number; date: string; period: string; status: string; finalizedAt: string | null } | null;
  sales: { totalSales: number; ccTipTotal: number; cashSales: number } | null;
  tipPoolCalculation: {
    grossCcTip: number;
    deductionRate: number;
    netCcTip: number;
    netGeneralCcTip: number;
    totalHostUpsellTip: number;
    perRoleBreakdown: Record<string, number> | null;
  } | null;
  payouts: SummaryPayoutRow[];
  onlinePlatformTotal: number;
}

export async function loadSummaryData(shiftId: number): Promise<SummaryData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, sales: null, tipPoolCalculation: null, payouts: [], onlinePlatformTotal: 0 };

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  const [calc] = await db.select().from(tipPoolCalculations).where(eq(tipPoolCalculations.shiftId, shiftId));

  const payoutRows = await db
    .select({
      employeeId: employeePayouts.employeeId,
      employeeName: employees.name,
      pointValueUsed: employeePayouts.pointValueUsed,
      tipPoolShare: employeePayouts.tipPoolShare,
      flatWageAmount: employeePayouts.flatWageAmount,
      hostUpsellTipShare: employeePayouts.hostUpsellTipShare,
      extraPayAmount: employeePayouts.extraPayAmount,
      totalCorePayout: employeePayouts.totalCorePayout,
    })
    .from(employeePayouts)
    .innerJoin(employees, eq(employeePayouts.employeeId, employees.id))
    .where(eq(employeePayouts.shiftId, shiftId));

  const platformRecords = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const onlinePlatformTotal = platformRecords.reduce((a, r) => a + r.salesAmount, 0);
  void onlinePlatforms; // reserved for a future per-platform breakdown on this page

  const normalizedPayoutRows = payoutRows.map((p) => ({ ...p, hostUpsellTipShare: p.hostUpsellTipShare ?? 0 }));

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status, finalizedAt: shift.finalizedAt },
    sales: sales ? { totalSales: sales.totalSales, ccTipTotal: sales.ccTipTotal, cashSales: sales.cashSales } : null,
    tipPoolCalculation: calc
      ? {
          grossCcTip: calc.grossCcTip,
          deductionRate: calc.deductionRate,
          netCcTip: calc.netCcTip,
          netGeneralCcTip: calc.netGeneralCcTip,
          totalHostUpsellTip: calc.totalHostUpsellTip,
          perRoleBreakdown: calc.perRoleBreakdown,
        }
      : null,
    payouts: normalizedPayoutRows.sort((a, b) => b.totalCorePayout - a.totalCorePayout),
    onlinePlatformTotal,
  };
}
