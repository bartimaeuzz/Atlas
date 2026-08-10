/**
 * Loader for the staff-facing "My Pay" page (2026-08-10) — the first real
 * caller of lib/roster/visibility.ts's getVisibleRosterEntries, which was
 * built and unit-tested back on 2026-08-08 but never wired into a live
 * page (no staff login existed until this round). This is deliberately a
 * NEW, separate loader rather than reusing loadSummaryData/loadRosterForCalc
 * — those are manager-facing and assume the caller can see everything;
 * this one exists specifically to apply the visibility restriction.
 */

import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  employees, employeePayouts, shifts, shiftRosterEntries, positions, restaurantSettings,
} from "@/db/schema";
import { getVisibleRosterEntries, type RosterEntryView, type Viewer } from "@/lib/roster/visibility";

export interface MyEarningsCoworkerRow extends RosterEntryView {
  employeeName: string;
}

export interface MyShiftEarnings {
  shiftId: number;
  date: string;
  period: "Lunch" | "Dinner";
  finalizedAt: string | null;
  payout: {
    pointValueUsed: number | null;
    tipPoolShare: number;
    pool1Share: number;
    pool2Share: number;
    pool3Share: number;
    flatWageAmount: number;
    hostUpsellTipShare: number;
    extraPayAmount: number;
    incentiveAmount: number;
    totalTip: number;
    totalCorePayout: number;
  };
  /** Everyone this employee is ALLOWED to see on this shift's roster,
   * already filtered by getVisibleRosterEntries — money figures on other
   * people's rows are already stripped out where the visibility rules say
   * they should be. The viewer's own row is always included in full. */
  coworkers: MyEarningsCoworkerRow[];
}

export interface MyEarningsData {
  employee: { id: number; name: string; systemRole: "STAFF" | "MANAGER" | "ADMIN" };
  shifts: MyShiftEarnings[]; // most recent finalized shift first
  lifetimeTotal: number; // sum of totalCorePayout across every shift shown
}

export async function loadMyEarnings(employeeId: number): Promise<MyEarningsData | null> {
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee) return null;

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const visibilitySettings = {
    showPeerEarningsFOH: settings?.rosterShowPeerEarningsFOH ?? true,
    showPeerEarningsBOH: settings?.rosterShowPeerEarningsBOH ?? false,
    restrictFOHToOwnCategory: settings?.rosterRestrictFOHToOwnCategory ?? true,
    restrictBOHToOwnCategory: settings?.rosterRestrictBOHToOwnCategory ?? true,
  };

  // Every finalized shift this employee has a locked payout for — the
  // authoritative "were they actually paid for this shift" signal, more
  // reliable than scanning shiftRosterEntries directly since that would
  // also pick up draft (not-yet-finalized) shifts, which shouldn't show
  // real numbers yet.
  const myShiftRows = await db
    .select({
      shiftId: shifts.id,
      date: shifts.date,
      period: shifts.period,
      finalizedAt: shifts.finalizedAt,
      pointValueUsed: employeePayouts.pointValueUsed,
      tipPoolShare: employeePayouts.tipPoolShare,
      pool1Share: employeePayouts.pool1Share,
      pool2Share: employeePayouts.pool2Share,
      pool3Share: employeePayouts.pool3Share,
      flatWageAmount: employeePayouts.flatWageAmount,
      hostUpsellTipShare: employeePayouts.hostUpsellTipShare,
      extraPayAmount: employeePayouts.extraPayAmount,
      incentiveAmount: employeePayouts.incentiveAmount,
      totalTip: employeePayouts.totalTip,
      totalCorePayout: employeePayouts.totalCorePayout,
    })
    .from(employeePayouts)
    .innerJoin(shifts, eq(employeePayouts.shiftId, shifts.id))
    .where(and(eq(employeePayouts.employeeId, employeeId), eq(shifts.status, "finalized")))
    .orderBy(desc(shifts.date));

  if (myShiftRows.length === 0) {
    return { employee: { id: employee.id, name: employee.name, systemRole: employee.systemRole }, shifts: [], lifetimeTotal: 0 };
  }

  const allShiftIds = myShiftRows.map((r) => r.shiftId);

  // Whole-roster + whole-payout data for every shift this employee
  // touched, in two batched queries rather than one per shift.
  const allRosterRows = await db
    .select({
      shiftId: shiftRosterEntries.shiftId,
      employeeId: shiftRosterEntries.employeeId,
      employeeName: employees.name,
      primaryPositionId: employees.primaryPositionId,
      positionId: positions.id,
      positionName: positions.name,
      positionCategory: positions.category,
      alwaysVisibleInRoster: positions.alwaysVisibleInRoster,
      earningsHiddenFromStaff: positions.earningsHiddenFromStaff,
    })
    .from(shiftRosterEntries)
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .where(inArray(shiftRosterEntries.shiftId, allShiftIds));

  const allPayoutRows = await db.select().from(employeePayouts).where(inArray(employeePayouts.shiftId, allShiftIds));
  const payoutByShiftAndEmployee = new Map(allPayoutRows.map((p) => [`${p.shiftId}:${p.employeeId}`, p]));

  const rosterByShift = new Map<number, typeof allRosterRows>();
  for (const r of allRosterRows) {
    const list = rosterByShift.get(r.shiftId) ?? [];
    list.push(r);
    rosterByShift.set(r.shiftId, list);
  }

  const resultShifts: MyShiftEarnings[] = myShiftRows.map((row) => {
    const rosterThisShift = rosterByShift.get(row.shiftId) ?? [];

    // Dedup to one entry per employee for this shift (same "pick the
    // wage-bearing row" convention used everywhere else in this project
    // for multi-role staffing — see loadRosterForCalc.ts's header comment
    // — here it's just deciding whose position category/visibility flags
    // represent that person on this shift, not resolving pay).
    const rowsByEmployeeId = new Map<number, typeof rosterThisShift>();
    for (const r of rosterThisShift) {
      const list = rowsByEmployeeId.get(r.employeeId) ?? [];
      list.push(r);
      rowsByEmployeeId.set(r.employeeId, list);
    }

    const allEntries: MyEarningsCoworkerRow[] = Array.from(rowsByEmployeeId.entries()).map(([empId, rows]) => {
      const representativeRow = rows.find((r) => r.positionId === r.primaryPositionId) ?? rows[0];
      const payout = payoutByShiftAndEmployee.get(`${row.shiftId}:${empId}`);
      return {
        employeeId: empId,
        employeeName: representativeRow.employeeName,
        positionId: representativeRow.positionId,
        positionCategory: representativeRow.positionCategory as "FOH" | "BOH",
        positionName: representativeRow.positionName,
        alwaysVisibleInRoster: representativeRow.alwaysVisibleInRoster,
        earningsHiddenFromStaff: representativeRow.earningsHiddenFromStaff,
        tipShare: payout?.totalTip ?? 0,
        flatWage: payout?.flatWageAmount ?? 0,
      };
    });

    const myRepresentativeRow = rowsByEmployeeId.get(employeeId)?.[0];
    const viewer: Viewer = {
      employeeId,
      systemRole: employee.systemRole,
      ownCategory: (myRepresentativeRow?.positionCategory as "FOH" | "BOH" | undefined) ?? "FOH",
    };

    const visibleEntries = getVisibleRosterEntries(viewer, allEntries, visibilitySettings) as MyEarningsCoworkerRow[];

    return {
      shiftId: row.shiftId,
      date: row.date,
      period: row.period,
      finalizedAt: row.finalizedAt,
      payout: {
        pointValueUsed: row.pointValueUsed,
        tipPoolShare: row.tipPoolShare,
        pool1Share: row.pool1Share,
        pool2Share: row.pool2Share,
        pool3Share: row.pool3Share,
        flatWageAmount: row.flatWageAmount,
        hostUpsellTipShare: row.hostUpsellTipShare ?? 0,
        extraPayAmount: row.extraPayAmount,
        incentiveAmount: row.incentiveAmount,
        totalTip: row.totalTip,
        totalCorePayout: row.totalCorePayout,
      },
      coworkers: visibleEntries,
    };
  });

  const lifetimeTotal = resultShifts.reduce((a, s) => a + s.payout.totalCorePayout, 0);

  return {
    employee: { id: employee.id, name: employee.name, systemRole: employee.systemRole },
    shifts: resultShifts,
    lifetimeTotal: Math.round(lifetimeTotal * 100) / 100,
  };
}
