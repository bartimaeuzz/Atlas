import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftSales, tipPoolCalculations, employeePayouts, employees,
  onlinePlatforms, onlinePlatformSalesRecords, shiftRosterEntries, positions,
} from "@/db/schema";
import { sortPayoutsForDisplay } from "./payoutSort";

export interface SummaryPayoutRow {
  employeeId: number;
  employeeName: string;
  pointValueUsed: number | null;
  tipPoolShare: number;
  pool1Share: number;
  pool2Share: number;
  pool3Share: number;
  flatWageAmount: number;
  /** Host cocktail/mocktail drink bonus, 0 if not applicable — already
   * included in totalCorePayout, shown separately for transparency. */
  hostUpsellTipShare: number;
  /** Ad hoc extra pay for shift coverage (2026-08-10), 0 if none — already
   * included in totalCorePayout, shown separately, never merged silently
   * into flatWageAmount. */
  extraPayAmount: number;
  /** tipPoolShare + hostUpsellTipShare — every dollar that's a TIP,
   * distinct from wage. Added 2026-08-10. */
  totalTip: number;
  /** Sum of every fired IncentiveRule payout this shift, 0 if none
   * (2026-08-10 — see lib/calc/incentiveRules.ts). Already included in
   * totalCorePayout, shown separately for transparency, same pattern as
   * extraPayAmount/hostUpsellTipShare. */
  incentiveAmount: number;
  totalCorePayout: number;
  /** Representative position for this shift (2026-08-10) — an employee
   * can have more than one roster row in a multi-role shift; same
   * "primaryPositionId row wins, else the first row" convention used
   * elsewhere (loadRosterForCalc.ts, loadMyEarnings.ts). Shown as its own
   * column and used to sort this table the same way as My Pay's coworker
   * list, per Oliver's ask for consistent ordering across the app. */
  positionName: string;
  positionCategory: "FOH" | "BOH";
}

export interface SummaryData {
  shift: { id: number; date: string; period: string; status: string; finalizedAt: string | null } | null;
  sales: { totalSales: number; ccTipTotal: number; cashSales: number; cashTip: number } | null;
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
      pool1Share: employeePayouts.pool1Share,
      pool2Share: employeePayouts.pool2Share,
      pool3Share: employeePayouts.pool3Share,
      flatWageAmount: employeePayouts.flatWageAmount,
      hostUpsellTipShare: employeePayouts.hostUpsellTipShare,
      extraPayAmount: employeePayouts.extraPayAmount,
      totalTip: employeePayouts.totalTip,
      incentiveAmount: employeePayouts.incentiveAmount,
      totalCorePayout: employeePayouts.totalCorePayout,
    })
    .from(employeePayouts)
    .innerJoin(employees, eq(employeePayouts.employeeId, employees.id))
    .where(eq(employeePayouts.shiftId, shiftId));

  // Resolve a representative position per employee for this shift — the
  // finalized snapshot (employeePayouts) doesn't carry position labels
  // (it's money-only, deliberately), so this joins live to
  // shiftRosterEntries + positions instead of adding a new snapshot
  // column. Safe for a FINALIZED shift specifically: roster/closing-report
  // edits are blocked once finalized (assertDraft), so this can't drift
  // out from under a locked report the way live settings could.
  const rosterRows = await db
    .select({
      employeeId: shiftRosterEntries.employeeId,
      positionId: shiftRosterEntries.positionId,
      positionName: positions.name,
      positionCategory: positions.category,
      primaryPositionId: employees.primaryPositionId,
    })
    .from(shiftRosterEntries)
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .where(eq(shiftRosterEntries.shiftId, shiftId));

  const rosterRowsByEmployeeId = new Map<number, typeof rosterRows>();
  for (const r of rosterRows) {
    const list = rosterRowsByEmployeeId.get(r.employeeId) ?? [];
    list.push(r);
    rosterRowsByEmployeeId.set(r.employeeId, list);
  }
  const positionByEmployeeId = new Map<number, { positionName: string; positionCategory: "FOH" | "BOH" }>();
  for (const [employeeId, rows] of rosterRowsByEmployeeId) {
    const representative = rows.find((r) => r.positionId === r.primaryPositionId) ?? rows[0];
    positionByEmployeeId.set(employeeId, {
      positionName: representative.positionName,
      positionCategory: representative.positionCategory as "FOH" | "BOH",
    });
  }

  const platformRecords = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(eq(onlinePlatformSalesRecords.shiftId, shiftId));
  const onlinePlatformTotal = platformRecords.reduce((a, r) => a + r.salesAmount, 0);
  void onlinePlatforms; // reserved for a future per-platform breakdown on this page

  const normalizedPayoutRows: SummaryPayoutRow[] = payoutRows.map((p) => ({
    ...p,
    hostUpsellTipShare: p.hostUpsellTipShare ?? 0,
    positionName: positionByEmployeeId.get(p.employeeId)?.positionName ?? "—",
    positionCategory: positionByEmployeeId.get(p.employeeId)?.positionCategory ?? "FOH",
  }));

  const namesById = Object.fromEntries(normalizedPayoutRows.map((p) => [p.employeeId, p.employeeName]));
  const positionsById = Object.fromEntries(
    normalizedPayoutRows.map((p) => [p.employeeId, { positionName: p.positionName, positionCategory: p.positionCategory }])
  );

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status, finalizedAt: shift.finalizedAt },
    sales: sales ? { totalSales: sales.totalSales, ccTipTotal: sales.ccTipTotal, cashSales: sales.cashSales, cashTip: sales.cashTip } : null,
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
    // Sort matches My Pay's coworker list (2026-08-10, Oliver's ask):
    // FOH before BOH, then position name, then employee name — replaces
    // the previous highest-payout-first sort.
    payouts: sortPayoutsForDisplay(normalizedPayoutRows, namesById, positionsById),
    onlinePlatformTotal,
  };
}
