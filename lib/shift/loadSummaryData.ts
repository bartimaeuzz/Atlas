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

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status, finalizedAt: shift.finalizedAt },
    sales: sales ? { totalSales: sales.totalSales, ccTipTotal: sales.ccTipTotal, cashSales: sales.cashSales } : null,
    tipPoolCalculation: calc
      ? {
          grossCcTip: calc.grossCcTip,
          deductionRate: calc.deductionRate,
          netCcTip: calc.netCcTip,
          netGeneralCcTip: calc.netGeneralCcTip,
          perRoleBreakdown: calc.perRoleBreakdown,
        }
      : null,
    payouts: payoutRows.sort((a, b) => b.totalCorePayout - a.totalCorePayout),
    onlinePlatformTotal,
  };
}
