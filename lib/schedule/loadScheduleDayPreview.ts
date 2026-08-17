/**
 * Loader for the staff-facing "who's working this day" preview
 * (2026-08-14, Oliver's ask: "each staff should be able to click
 * calendar to see staff view like in a preview stage who work on that
 * day"). Reuses the exact same permission machinery as My Pay's
 * coworker list (lib/roster/visibility.ts's getVisibleRosterEntries) —
 * Oliver's own framing was "option on setting to allow who see who is
 * for admin to override permission as usual," i.e. don't invent a
 * second, parallel visibility system for the schedule; use the one
 * already built. The category-restriction setting
 * (rosterRestrictFOHToOwnCategory/BOH) was in fact already built ahead
 * of this exact page — see its comment in SettingsForm.tsx, written
 * 2026-08-08/10: "Not yet used by a live staff view — this sets the
 * policy ahead of that page shipping." This is that page.
 *
 * Deliberately reads from plannedShiftAssignments (the advance
 * schedule), not shiftRosterEntries (the day-of actual roster) —
 * someone previewing next Thursday needs the PLAN, which usually exists
 * well before any real Shift row for that date does. No money fields
 * are ever included here at all (not even gated behind a setting) —
 * this is a schedule preview, not a pay page.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, positions, scheduleWeeks, plannedShiftAssignments, restaurantSettings } from "@/db/schema";
import { getVisibleRosterEntries, type RosterEntryView, type Viewer } from "@/lib/roster/visibility";
import { weekStartFor } from "@/lib/schedule/weekMath";

export interface DayPreviewEntry {
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  positionCategory: "FOH" | "BOH";
  period: "Lunch" | "Dinner";
}

export interface ScheduleDayPreviewData {
  date: string;
  /** False if this viewer's category has the coworker list turned off
   * entirely (settings) and they have no assignment of their own that
   * day either -- lunch/dinner will be empty in that case, distinct
   * from "published but genuinely nobody scheduled." */
  viewerCanSeeCoworkers: boolean;
  lunch: DayPreviewEntry[];
  dinner: DayPreviewEntry[];
}

function compareEntries(a: DayPreviewEntry, b: DayPreviewEntry): number {
  const categoryRank = (c: string) => (c === "FOH" ? 0 : 1);
  const categoryDiff = categoryRank(a.positionCategory) - categoryRank(b.positionCategory);
  if (categoryDiff !== 0) return categoryDiff;
  const positionDiff = a.positionName.localeCompare(b.positionName);
  if (positionDiff !== 0) return positionDiff;
  return a.employeeName.localeCompare(b.employeeName);
}

/** Returns null if this date's week doesn't exist or isn't published —
 * draft weeks are never previewable by staff, same rule as My Schedule
 * itself. */
export async function loadScheduleDayPreview(viewerEmployeeId: number, date: string): Promise<ScheduleDayPreviewData | null> {
  const weekStartDate = weekStartFor(date);
  const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.weekStartDate, weekStartDate));
  if (!week || week.status !== "published") return null;

  const [viewerEmployee] = await db.select().from(employees).where(eq(employees.id, viewerEmployeeId));
  if (!viewerEmployee) return null;

  const rows = await db
    .select({
      employeeId: plannedShiftAssignments.employeeId,
      employeeName: employees.nickname,
      positionId: positions.id,
      positionName: positions.name,
      positionCategory: positions.category,
      alwaysVisibleInRoster: positions.alwaysVisibleInRoster,
      earningsHiddenFromStaff: positions.earningsHiddenFromStaff,
      grantsManagerAccess: positions.grantsManagerAccess,
      period: plannedShiftAssignments.period,
    })
    .from(plannedShiftAssignments)
    .innerJoin(employees, eq(plannedShiftAssignments.employeeId, employees.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .where(and(eq(plannedShiftAssignments.weekId, week.id), eq(plannedShiftAssignments.date, date)));

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const visibilitySettings = {
    // Money toggles are irrelevant here (no money fields are ever
    // included in `allEntries` below), left permissive so they're
    // structurally present for getVisibleRosterEntries but never do
    // anything.
    showPeerTipFOH: true,
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: settings?.rosterRestrictFOHToOwnCategory ?? true,
    restrictBOHToOwnCategory: settings?.rosterRestrictBOHToOwnCategory ?? true,
    showCoworkerListFOH: settings?.rosterShowCoworkerListFOH ?? true,
    showCoworkerListBOH: settings?.rosterShowCoworkerListBOH ?? true,
  };

  const viewerRowToday = rows.find((r) => r.employeeId === viewerEmployeeId);

  const [viewerPrimaryPosition] = viewerEmployee.primaryPositionId
    ? await db.select().from(positions).where(eq(positions.id, viewerEmployee.primaryPositionId))
    : [undefined];

  // Same shift-scoped elevation rule as loadMyEarnings: a standing
  // MANAGER/ADMIN systemRole always wins; otherwise, being scheduled
  // THAT DAY into a grantsManagerAccess position elevates just this
  // preview, same as it would for the real roster once that day
  // actually happens.
  const shiftGrantsManagerAccess = viewerRowToday?.grantsManagerAccess ?? false;
  const effectiveSystemRole: "STAFF" | "MANAGER" | "ADMIN" =
    viewerEmployee.systemRole === "ADMIN" || viewerEmployee.systemRole === "MANAGER"
      ? viewerEmployee.systemRole
      : shiftGrantsManagerAccess
        ? "MANAGER"
        : "STAFF";

  const viewer: Viewer = {
    employeeId: viewerEmployeeId,
    systemRole: effectiveSystemRole,
    ownCategory:
      (viewerRowToday?.positionCategory as "FOH" | "BOH" | undefined) ??
      (viewerPrimaryPosition?.category as "FOH" | "BOH" | undefined) ??
      "FOH",
  };

  const allEntries: (RosterEntryView & DayPreviewEntry)[] = rows
    .map((r) => ({
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      positionId: r.positionId,
      positionName: r.positionName,
      positionCategory: r.positionCategory as "FOH" | "BOH",
      alwaysVisibleInRoster: r.alwaysVisibleInRoster,
      earningsHiddenFromStaff: r.earningsHiddenFromStaff,
      period: r.period as "Lunch" | "Dinner",
    }))
    .sort(compareEntries);

  const viewerCanSeeCoworkers =
    effectiveSystemRole !== "STAFF" ||
    (viewer.ownCategory === "FOH" ? visibilitySettings.showCoworkerListFOH : visibilitySettings.showCoworkerListBOH);

  const visible = getVisibleRosterEntries(viewer, allEntries, visibilitySettings) as (RosterEntryView & DayPreviewEntry)[];

  return {
    date,
    viewerCanSeeCoworkers,
    lunch: visible.filter((e) => e.period === "Lunch"),
    dinner: visible.filter((e) => e.period === "Dinner"),
  };
}
