import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts, shiftRosterEntries, employees, positions, positionStaffingTargets } from "@/db/schema";
import { loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { dayOfWeek } from "@/lib/schedule/weekMath";

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
  /** primaryPositionId (2026-08-10) — lets the "Add someone" form
   * default the Position dropdown to this person's usual role the moment
   * they're picked, instead of making the manager re-select it every
   * time. Null for an employee with no primary position set. */
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
  /** employeeId -> assigned positionId[], from Employee admin (2026-08-10)
   * — powers the "Add someone" dropdown's grey-out-but-still-selectable
   * behavior for positions that employee isn't set up for. */
  employeeAssignedPositionIds: Record<number, number[]>;
  /** positionId -> headcount target for THIS shift's exact day-of-week +
   * period (2026-08-11) — same positionStaffingTargets table the Schedule
   * Planner grid reads, resolved down to a single day here since a roster
   * page is always for one specific date+period. Powers the "N/target"
   * badge so the roster page reads the same way as the weekly plan grid. */
  targets: Record<number, number>;
}

export async function loadRosterPageData(shiftId: number): Promise<RosterPageData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) {
    return { shift: null, roster: [], allEmployees: [], allPositions: [], employeeAssignedPositionIds: {}, targets: {} };
  }

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
    .select({ id: employees.id, name: employees.name, primaryPositionId: employees.primaryPositionId })
    .from(employees)
    .where(eq(employees.active, true));

  // Retired positions stay valid for shifts that already reference them
  // (this loader's `roster` rows above join freely regardless of active
  // status), but shouldn't be offered when staffing a NEW roster entry.
  // Sorted FOH-then-BOH, same convention as the Schedule Planner grids, so
  // the roster page's position ordering matches.
  const allPositionsRaw = await db
    .select({ id: positions.id, name: positions.name, category: positions.category })
    .from(positions)
    .where(eq(positions.active, true));
  const allPositions = allPositionsRaw
    .map((p) => ({ ...p, category: p.category as "FOH" | "BOH" }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));

  const employeeAssignedPositionIds = await loadEmployeeAssignedPositionIds();

  const targetRows = await db.select().from(positionStaffingTargets).where(
    eq(positionStaffingTargets.dayOfWeek, dayOfWeek(shift.date))
  );
  const targets: Record<number, number> = {};
  for (const row of targetRows) {
    if (row.period !== shift.period) continue;
    targets[row.positionId] = row.targetCount;
  }

  return {
    shift: { id: shift.id, date: shift.date, period: shift.period, status: shift.status },
    roster: rows.map((r) => ({ ...r, positionCategory: r.positionCategory as "FOH" | "BOH" })),
    allEmployees,
    allPositions,
    employeeAssignedPositionIds,
    targets,
  };
}
