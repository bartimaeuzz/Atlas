/**
 * Loader for one calendar date's Petty Cash ledger page (2026-08-14,
 * Ledger v1) -- the itemized payouts plus the daily cash-drawer
 * reconciliation. See db/schema.ts's dailyCashReconciliations comment for
 * why Sales cash / Tip cash are computed HERE from that date's shiftSales
 * rows rather than stored as their own editable columns: Oliver's own
 * words were "you supposed not to close daily expenses without knowing
 * what cash we would get from register anyway," so the two numbers are
 * deliberately tied together at the query level, not just by convention.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import {
  pettyCashEntries,
  ledgerVendors,
  ledgerCategories,
  dailyCashReconciliations,
  shifts,
  shiftSales,
  employees,
} from "@/db/schema";
import { parseDate, toIso } from "@/lib/schedule/weekMath";

export interface PettyCashEntryView {
  id: number;
  date: string;
  vendorId: number | null;
  vendorName: string | null;
  categoryId: number;
  categoryName: string;
  note: string | null;
  amount: number;
  createdByName: string;
  createdAt: string;
}

export interface PettyCashDayData {
  date: string;
  entries: PettyCashEntryView[];
  totalPettyCashOut: number;

  // Reconciliation
  reconciliationId: number | null;
  status: "draft" | "finalized";
  beginningBalance: number;
  cashSales: number; // computed, from that date's shiftSales
  cashTip: number; // computed, from that date's shiftSales
  otherCash: number;
  totalCashIn: number; // cashSales + cashTip + otherCash
  expectedTotalBalance: number; // beginningBalance + totalCashIn - totalPettyCashOut
  countedAmount: number | null;
  note: string | null;
  finalizedAt: string | null;
  finalizedByName: string | null;

  // Gate: every Shift for this date must be finalized before this day's
  // reconciliation can be finalized -- see lib/actions/ledger.ts.
  blockingShifts: { period: "Lunch" | "Dinner"; status: "draft" | "finalized" }[];
  /** True once every Shift row that exists for this date is finalized (or
   * none exist at all, e.g. a closed day) -- the shift-side half of the
   * finalize gate. The action layer also requires countedAmount to be
   * entered; that's not checked here since it can be typed in the same
   * form submission that finalizes. */
  shiftsReady: boolean;

  vendors: { id: number; name: string }[];
  categories: { id: number; name: string }[];

  /** Suggested beginning balance for a brand-new (never-saved)
   * reconciliation row -- yesterday's expected total balance, same
   * "carries forward" convention as the Soothr spreadsheet. Only used to
   * pre-fill the form; a manager can always override it. */
  suggestedBeginningBalance: number | null;
}

export async function loadPettyCashDay(date: string): Promise<PettyCashDayData> {
  const [entryRows, [reconciliation], shiftRows, activeVendors, activeCategories] = await Promise.all([
    db
      .select({
        id: pettyCashEntries.id,
        date: pettyCashEntries.date,
        vendorId: pettyCashEntries.vendorId,
        vendorName: ledgerVendors.name,
        categoryId: pettyCashEntries.categoryId,
        categoryName: ledgerCategories.name,
        note: pettyCashEntries.note,
        amount: pettyCashEntries.amount,
        createdByName: employees.name,
        createdAt: pettyCashEntries.createdAt,
      })
      .from(pettyCashEntries)
      .innerJoin(ledgerCategories, eq(pettyCashEntries.categoryId, ledgerCategories.id))
      .leftJoin(ledgerVendors, eq(pettyCashEntries.vendorId, ledgerVendors.id))
      .innerJoin(employees, eq(pettyCashEntries.createdByEmployeeId, employees.id))
      .where(eq(pettyCashEntries.date, date)),
    db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date)),
    db
      .select({ period: shifts.period, status: shifts.status })
      .from(shifts)
      .where(eq(shifts.date, date)),
    db.select({ id: ledgerVendors.id, name: ledgerVendors.name }).from(ledgerVendors).where(eq(ledgerVendors.active, true)),
    db.select({ id: ledgerCategories.id, name: ledgerCategories.name }).from(ledgerCategories).where(eq(ledgerCategories.active, true)),
  ]);

  // Cash sales / cash tip come ONLY from shifts that are actually
  // finalized for this date -- a draft shift's numbers aren't real yet.
  const finalizedShiftIds = (
    await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.date, date), eq(shifts.status, "finalized")))
  ).map((r) => r.id);

  let cashSales = 0;
  let cashTip = 0;
  if (finalizedShiftIds.length > 0) {
    const salesRows = await db.select().from(shiftSales);
    for (const row of salesRows) {
      if (finalizedShiftIds.includes(row.shiftId)) {
        cashSales += row.cashSales;
        cashTip += row.cashTip;
      }
    }
  }

  const totalPettyCashOut = entryRows.reduce((sum, e) => sum + e.amount, 0);

  const beginningBalance = reconciliation?.beginningBalance ?? 0;
  const otherCash = reconciliation?.otherCash ?? 0;
  const totalCashIn = cashSales + cashTip + otherCash;
  const expectedTotalBalance = beginningBalance + totalCashIn - totalPettyCashOut;

  const blockingShifts = shiftRows.map((s) => ({ period: s.period as "Lunch" | "Dinner", status: s.status as "draft" | "finalized" }));
  const anyUnfinalizedShift = blockingShifts.some((s) => s.status !== "finalized");
  const status = (reconciliation?.status as "draft" | "finalized" | undefined) ?? "draft";

  let finalizedByName: string | null = null;
  if (reconciliation?.finalizedByEmployeeId) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, reconciliation.finalizedByEmployeeId));
    finalizedByName = emp?.name ?? null;
  }

  // Suggested beginning balance for a brand-new day: yesterday's expected
  // total balance, if yesterday has its own reconciliation on file.
  let suggestedBeginningBalance: number | null = null;
  if (!reconciliation) {
    const yesterday = toIso(new Date(parseDate(date).getTime() - 24 * 60 * 60 * 1000));
    const [yRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, yesterday));
    if (yRecon) {
      const yEntries = await db.select({ amount: pettyCashEntries.amount }).from(pettyCashEntries).where(eq(pettyCashEntries.date, yesterday));
      const yShiftIds = (
        await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.date, yesterday), eq(shifts.status, "finalized")))
      ).map((r) => r.id);
      let ySales = 0;
      let yTip = 0;
      if (yShiftIds.length > 0) {
        const ySalesRows = await db.select().from(shiftSales);
        for (const row of ySalesRows) {
          if (yShiftIds.includes(row.shiftId)) {
            ySales += row.cashSales;
            yTip += row.cashTip;
          }
        }
      }
      const yOut = yEntries.reduce((sum, e) => sum + e.amount, 0);
      suggestedBeginningBalance = yRecon.beginningBalance + (ySales + yTip + yRecon.otherCash) - yOut;
    }
  }

  return {
    date,
    entries: entryRows,
    totalPettyCashOut,
    reconciliationId: reconciliation?.id ?? null,
    status,
    beginningBalance,
    cashSales,
    cashTip,
    otherCash,
    totalCashIn,
    expectedTotalBalance,
    countedAmount: reconciliation?.countedAmount ?? null,
    note: reconciliation?.note ?? null,
    finalizedAt: reconciliation?.finalizedAt ?? null,
    finalizedByName,
    blockingShifts,
    shiftsReady: !anyUnfinalizedShift,
    vendors: activeVendors,
    categories: activeCategories,
    suggestedBeginningBalance,
  };
}
