import { eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { shifts, shiftRosterEntries, shiftAttendanceMarks, employees, positions, positionStaffingTargets, swapRequests, plannedShiftAssignments } from "@/db/schema";
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
  /** Set when this person holds the slot via a completed staff shift
   * swap (2026-08-25, Oliver: the roster must show a swapped-in shift
   * isn't the person's original schedule). Value is who gave it up. */
  swappedFromName: string | null;
  /** Day-of coverage record (2026-08-25): "extra" = over-target busy-day
   * add, "substitute" = covering the named absent person. */
  coverageKind: "extra" | "substitute" | null;
  coverageNote: string | null;
  coversEmployeeName: string | null;
  /** "late" when this person has a late attendance mark on this shift
   * (no_show/emergency people have no roster row — see `marks`). */
  attendanceMark: "no_show" | "late" | "emergency" | null;
}

export interface RosterAttendanceMark {
  employeeId: number;
  employeeName: string;
  mark: "no_show" | "late" | "emergency";
  note: string | null;
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
  /** Every attendance mark on this shift (2026-08-25). Roster rows carry
   * their own `attendanceMark` for badges; this list is the full record,
   * including no-show/emergency people who have no roster row -- powers
   * the "Out today" undo list and the closing report. */
  marks: RosterAttendanceMark[];
}

/** Compact attendance + coverage record for one shift -- the closing
 * report shows it beside the deduction / extra-pay inputs as reminders
 * (2026-08-25, Oliver: "when you close shift you will be able to see
 * it"). Informational only; nothing applies money automatically. */
export interface ShiftAttendanceSummary {
  marks: RosterAttendanceMark[];
  coverage: { employeeName: string; kind: "extra" | "substitute"; note: string | null; coversEmployeeName: string | null }[];
}

export async function loadShiftAttendanceSummary(shiftId: number): Promise<ShiftAttendanceSummary> {
  const covers = alias(employees, "covers");
  const [markRows, coverageRows] = await Promise.all([
    db
      .select({
        employeeId: shiftAttendanceMarks.employeeId,
        employeeName: employees.nickname,
        mark: shiftAttendanceMarks.mark,
        note: shiftAttendanceMarks.note,
      })
      .from(shiftAttendanceMarks)
      .innerJoin(employees, eq(shiftAttendanceMarks.employeeId, employees.id))
      .where(eq(shiftAttendanceMarks.shiftId, shiftId)),
    db
      .select({
        employeeName: employees.nickname,
        kind: shiftRosterEntries.coverageKind,
        note: shiftRosterEntries.coverageNote,
        coversEmployeeName: covers.nickname,
      })
      .from(shiftRosterEntries)
      .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
      .leftJoin(covers, eq(shiftRosterEntries.coversEmployeeId, covers.id))
      .where(eq(shiftRosterEntries.shiftId, shiftId)),
  ]);
  return {
    marks: markRows,
    coverage: coverageRows.filter((c): c is typeof c & { kind: "extra" | "substitute" } => c.kind != null),
  };
}

export async function loadRosterPageData(shiftId: number): Promise<RosterPageData> {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) {
    return { shift: null, roster: [], allEmployees: [], allPositions: [], employeeAssignedPositionIds: {}, targets: {}, marks: [] };
  }

  const covers = alias(employees, "covers");
  const rows = await db
    .select({
      rosterEntryId: shiftRosterEntries.id,
      employeeId: employees.id,
      employeeName: employees.nickname,
      positionId: positions.id,
      positionName: positions.name,
      positionCategory: positions.category,
      pointValueOverride: shiftRosterEntries.pointValueOverride,
      coverageKind: shiftRosterEntries.coverageKind,
      coverageNote: shiftRosterEntries.coverageNote,
      coversEmployeeName: covers.nickname,
    })
    .from(shiftRosterEntries)
    .innerJoin(employees, eq(shiftRosterEntries.employeeId, employees.id))
    .innerJoin(positions, eq(shiftRosterEntries.positionId, positions.id))
    .leftJoin(covers, eq(shiftRosterEntries.coversEmployeeId, covers.id))
    .where(eq(shiftRosterEntries.shiftId, shiftId));

  const markRows = await db
    .select({
      employeeId: shiftAttendanceMarks.employeeId,
      employeeName: employees.nickname,
      mark: shiftAttendanceMarks.mark,
      note: shiftAttendanceMarks.note,
    })
    .from(shiftAttendanceMarks)
    .innerJoin(employees, eq(shiftAttendanceMarks.employeeId, employees.id))
    .where(eq(shiftAttendanceMarks.shiftId, shiftId));
  const markByEmployee = new Map(markRows.map((m) => [m.employeeId, m.mark]));

  // Completed staff swaps covering this exact date+period, keyed by who
  // holds the slot now (accepter) + position — marks roster rows that
  // aren't the person's original schedule. Derived from swapRequests at
  // read time, same convention as loadWeeklyPlan's swap flag.
  const requesters = alias(employees, "requesters");
  const completedSwaps = await db
    .select({
      acceptingEmployeeId: swapRequests.acceptingEmployeeId,
      positionId: plannedShiftAssignments.positionId,
      requesterName: requesters.nickname,
    })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .innerJoin(requesters, eq(swapRequests.requestingEmployeeId, requesters.id))
    .where(
      and(
        eq(swapRequests.status, "completed"),
        eq(plannedShiftAssignments.date, shift.date),
        eq(plannedShiftAssignments.period, shift.period)
      )
    );
  const swappedFromByKey = new Map<string, string>();
  for (const s of completedSwaps) {
    if (s.acceptingEmployeeId != null) swappedFromByKey.set(`${s.acceptingEmployeeId}:${s.positionId}`, s.requesterName);
  }

  const allEmployees = await db
    .select({ id: employees.id, name: employees.nickname, primaryPositionId: employees.primaryPositionId })
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
    roster: rows.map((r) => ({
      ...r,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      swappedFromName: swappedFromByKey.get(`${r.employeeId}:${r.positionId}`) ?? null,
      attendanceMark: markByEmployee.get(r.employeeId) ?? null,
    })),
    allEmployees,
    allPositions,
    employeeAssignedPositionIds,
    targets,
    marks: markRows,
  };
}
