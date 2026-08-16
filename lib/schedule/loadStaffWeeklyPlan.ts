/**
 * Staff-facing full-week schedule view (2026-08-16, Oliver's ask: "staff
 * should see all day in a week schedule view as well like manager
 * diagnose view. but no edit and no understaff sign and other but can
 * see ring color status so they know someone swap in to their week and
 * such."). Confirmed with Oliver via AskUserQuestion: reachable from a
 * new "View full week" link on My Schedule (keeping the existing single-
 * day click-through as-is), and it follows the SAME roster-visibility
 * rules already enforced on the single-day preview
 * (loadScheduleDayPreview.ts) and My Pay's coworker list
 * (lib/roster/visibility.ts) — not a looser rule just because no money
 * is ever shown on a schedule grid.
 *
 * Reuses loadWeeklyPlan for the actual data (same shape
 * WeeklyPlanGrid already knows how to render with
 * readOnly+hideDiagnostics=true — see app/schedule/WeeklyPlanGrid.tsx),
 * then filters assignments through getVisibleRosterEntries ONE DAY AT A
 * TIME, mirroring loadScheduleDayPreview's own per-day viewer
 * computation: a grantsManagerAccess position elevates the viewer only
 * for the day(s) they're actually scheduled into it (the same "shift-
 * scoped elevation" rule used by loadMyEarnings and the day preview),
 * so a week view can't just compute the viewer's access once for the
 * whole week.
 *
 * Position ROWS (not individual entries) use a simpler, slightly more
 * generous rule than the strict per-day entry filter: a position stays
 * visible as a row for the whole week if it's the viewer's own primary
 * category, is flagged alwaysVisibleInRoster, or has at least one
 * assignment that survived the per-day filter on some day. This avoids
 * simulating a full per-day category union just to decide which grid
 * rows to draw — a deliberate simplification, not a visibility leak: no
 * entry itself is ever shown unless it individually passed the same
 * per-day check the single-day preview already applies.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, positions, scheduleWeeks, restaurantSettings } from "@/db/schema";
import { getVisibleRosterEntries, type RosterEntryView, type Viewer } from "@/lib/roster/visibility";
import { loadWeeklyPlan, type WeeklyPlanData, type PlannedAssignmentRow } from "@/lib/schedule/loadWeeklyPlan";

export interface StaffWeeklyPlanData extends WeeklyPlanData {
  /** False if the viewer's coworker list was turned off (in Settings)
   * for at least one day this week — same meaning/message as
   * loadScheduleDayPreview's flag of the same name. */
  viewerCanSeeCoworkers: boolean;
}

/** Returns null if this week doesn't exist or isn't published — staff
 * never get a week view of a draft, same rule as every other staff-
 * facing schedule surface (My Schedule's calendar, the single-day
 * preview). */
export async function loadStaffWeeklyPlan(
  viewerEmployeeId: number,
  weekStartDate: string
): Promise<StaffWeeklyPlanData | null> {
  const [weekRow] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.weekStartDate, weekStartDate));
  if (!weekRow || weekRow.status !== "published") return null;

  const data = await loadWeeklyPlan(weekStartDate);

  const [viewerEmployee] = await db.select().from(employees).where(eq(employees.id, viewerEmployeeId));
  if (!viewerEmployee) return null;

  // A standing MANAGER/ADMIN sees the entire roster, same rule as
  // getVisibleRosterEntries itself — no need to run the per-day filter.
  if (viewerEmployee.systemRole === "MANAGER" || viewerEmployee.systemRole === "ADMIN") {
    return { ...data, viewerCanSeeCoworkers: true };
  }

  const allPositions = await db.select().from(positions);
  const positionById = new Map(allPositions.map((p) => [p.id, p]));

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const visibilitySettings = {
    // Money toggles are irrelevant here (no money fields ever exist on
    // a PlannedAssignmentRow), left permissive so they're structurally
    // present for getVisibleRosterEntries but never do anything.
    showPeerTipFOH: true,
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: settings?.rosterRestrictFOHToOwnCategory ?? true,
    restrictBOHToOwnCategory: settings?.rosterRestrictBOHToOwnCategory ?? true,
    showCoworkerListFOH: settings?.rosterShowCoworkerListFOH ?? true,
    showCoworkerListBOH: settings?.rosterShowCoworkerListBOH ?? true,
  };

  const [viewerPrimaryPosition] = viewerEmployee.primaryPositionId
    ? await db.select().from(positions).where(eq(positions.id, viewerEmployee.primaryPositionId))
    : [undefined];
  const viewerOwnCategory = (viewerPrimaryPosition?.category as "FOH" | "BOH" | undefined) ?? "FOH";

  let viewerCanSeeCoworkers = true;
  const visibleAssignments: PlannedAssignmentRow[] = [];

  for (const date of data.dates) {
    const dayAssignments = data.assignments.filter((a) => a.date === date);
    const viewerRowToday = dayAssignments.find((a) => a.employeeId === viewerEmployeeId);

    const shiftGrantsManagerAccess = viewerRowToday
      ? (positionById.get(viewerRowToday.positionId)?.grantsManagerAccess ?? false)
      : false;
    const effectiveSystemRole: "STAFF" | "MANAGER" = shiftGrantsManagerAccess ? "MANAGER" : "STAFF";

    const viewer: Viewer = {
      employeeId: viewerEmployeeId,
      systemRole: effectiveSystemRole,
      ownCategory: viewerRowToday?.positionCategory ?? viewerOwnCategory,
    };

    const dayCanSeeCoworkers =
      effectiveSystemRole !== "STAFF" ||
      (viewer.ownCategory === "FOH" ? visibilitySettings.showCoworkerListFOH : visibilitySettings.showCoworkerListBOH);
    if (!dayCanSeeCoworkers) viewerCanSeeCoworkers = false;

    const allEntries: (RosterEntryView & { assignmentRow: PlannedAssignmentRow })[] = dayAssignments.map((a) => {
      const position = positionById.get(a.positionId);
      return {
        employeeId: a.employeeId,
        positionId: a.positionId,
        positionCategory: a.positionCategory,
        positionName: a.positionName,
        alwaysVisibleInRoster: position?.alwaysVisibleInRoster ?? false,
        earningsHiddenFromStaff: position?.earningsHiddenFromStaff ?? false,
        assignmentRow: a,
      };
    });

    const visible = getVisibleRosterEntries(viewer, allEntries, visibilitySettings) as (RosterEntryView & {
      assignmentRow: PlannedAssignmentRow;
    })[];
    visibleAssignments.push(...visible.map((v) => v.assignmentRow));
  }

  const positionIdsWithVisibleAssignment = new Set(visibleAssignments.map((a) => a.positionId));
  const visiblePositions = data.positions.filter(
    (p) =>
      positionIdsWithVisibleAssignment.has(p.id) ||
      positionById.get(p.id)?.alwaysVisibleInRoster ||
      p.category === viewerOwnCategory
  );

  return {
    ...data,
    assignments: visibleAssignments,
    positions: visiblePositions,
    viewerCanSeeCoworkers,
  };
}
