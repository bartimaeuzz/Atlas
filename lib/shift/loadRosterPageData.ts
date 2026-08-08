import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, shiftRosterEntries, employees, positions } from "@/db/schema";

export interface RosterPageEntry {
  rosterEntryId: number;
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  pointValueOverride: number | null;
}

export interface RosterPageData {
  shift: { id: number; date: string; period: string; status: string } | null;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
}

export async function loadRosterPageData(shiftId: number): Promise<RosterPageData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) return { shift: null, roster: [], allEmployees: [], allPositions: [] };

  const rows = await db
    .select({
      rosterEntryId: shiftRosterEntries.id,
      employeeId: employees.id,
      employeeName: employees.name,
      positionId: positions.id,
      positionName: positions.name,
      positionCategory: positions.category,
      pointValueOverride: shiftRosterEntries.pointValueOverride,
    })
    .from(shiftRosterEntries)
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .where(eq(shiftRosterEntries.shiftId, shiftId));

  const allEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.active, true));

  const allPositions = await db.select({ id: positions.id, name: positions.name, category: positions.category }).from(positions);

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status },
    roster: rows.map((r) => ({ ...r, positionCategory: r.positionCategory as "FOH" | "BOH" })),
    allEmployees,
    allPositions: allPositions.map((p) => ({ ...p, category: p.category as "FOH" | "BOH" })),
  };
}
