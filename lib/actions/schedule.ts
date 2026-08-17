"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  employeeScheduleTemplates,
  positionStaffingTargets,
  positions,
  scheduleWeeks,
  plannedShiftAssignments,
  employees,
  employeePositions,
  scheduleChangeLog,
} from "@/db/schema";
import { projectAssignmentsForWeek } from "@/lib/schedule/projectTemplate";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { datesInWeek, dayOfWeek } from "@/lib/schedule/weekMath";

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
const PERIODS = ["Lunch", "Dinner"] as const;

export interface ScheduleActionState {
  error: string | null;
  saved?: boolean;
}

/** Resyncs the WHOLE positionStaffingTargets table from one grid
 * submission — same delete-then-reinsert pattern as
 * syncPositionChildRows in lib/actions/positions.ts, appropriate here for
 * the same reason: a small, position-scoped table with nothing else
 * referencing it, and the form always submits every cell (even blank
 * ones), so a full resync is simpler and safer than diffing. Rows with a
 * target of 0 are simply not stored — an absent row already means 0, per
 * loadStaffingTargets's sparse-lookup convention. */
export async function updateStaffingTargets(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  try {
    const allPositions = await db.select({ id: positions.id }).from(positions);

    const rows: { positionId: number; dayOfWeek: number; period: "Lunch" | "Dinner"; targetCount: number }[] = [];
    for (const p of allPositions) {
      for (const dayOfWeek of DAYS_OF_WEEK) {
        for (const period of PERIODS) {
          const raw = formData.get(`target_${p.id}_${dayOfWeek}_${period}`);
          const trimmed = raw === null ? "" : String(raw).trim();
          if (trimmed === "") continue;

          const n = Number(trimmed);
          if (Number.isNaN(n) || n < 0) {
            throw new Error("Headcount targets must be non-negative whole numbers");
          }
          const targetCount = Math.round(n);
          if (targetCount > 0) rows.push({ positionId: p.id, dayOfWeek, period, targetCount });
        }
      }
    }

    await db.delete(positionStaffingTargets);
    if (rows.length > 0) {
      await db.insert(positionStaffingTargets).values(rows);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/schedule/targets");
  return { error: null, saved: true };
}

/** Sets the RED vacancy flag — confirmed with Oliver this means
 * resignation notice or a promotion/transfer, NOT an open swap request.
 * See db/schema.ts's comment on vacancyReason for the full reasoning.
 *
 * Scope by reason (2026-08-11, Oliver — clarified after testing on
 * himself with a real resignation):
 *   - RESIGNATION: the person is leaving entirely, so every active
 *     template row for that employeeId gets flagged, regardless of
 *     position/day/period.
 *   - PROMOTION and OTHER: scoped to every active row for that
 *     employeeId + positionId. These share a scope by design (2026-08-12,
 *     following the Template Assignments redesign): the UI's smallest
 *     addressable unit is now "this person, in this position" (a kebab
 *     menu on the position/employee group, not a single day/period row),
 *     so both "promoted out of this role" and "dropping this position
 *     entirely" naturally mean the same blast radius — every day/shift
 *     they work in that one position. They stay separate reasons because
 *     the LABEL matters (what staff/managers read later), even though the
 *     scope is identical. The old "drop just one recurring day" case this
 *     used to cover is now handled directly in the grid: unchecking a
 *     single day/period box and saving retires just that row immediately,
 *     no advance-notice red-flag treatment needed for that. */
export async function setTemplateVacancy(
  templateId: number,
  vacancyReason: "RESIGNATION" | "PROMOTION" | "OTHER",
  vacancyStartsOn: string
) {
  const [target] = await db.select().from(employeeScheduleTemplates).where(eq(employeeScheduleTemplates.id, templateId));
  if (!target) return;

  const scopeCondition =
    vacancyReason === "RESIGNATION"
      ? and(eq(employeeScheduleTemplates.employeeId, target.employeeId), eq(employeeScheduleTemplates.active, true))
      : and(
          eq(employeeScheduleTemplates.employeeId, target.employeeId),
          eq(employeeScheduleTemplates.positionId, target.positionId),
          eq(employeeScheduleTemplates.active, true)
        );

  await db.update(employeeScheduleTemplates).set({ vacancyReason, vacancyStartsOn }).where(scopeCondition);
  revalidatePath("/schedule/templates");
}

/** Mirrors setTemplateVacancy's scope, read from the row's CURRENT
 * reason before clearing — so undoing a resignation clears every row
 * it flagged, not just the one you happened to click "Clear" on. Only
 * clears rows that still have that same reason, so it can't
 * accidentally wipe out an unrelated flag set for a different reason. */
export async function clearTemplateVacancy(templateId: number) {
  const [target] = await db.select().from(employeeScheduleTemplates).where(eq(employeeScheduleTemplates.id, templateId));
  if (!target || !target.vacancyReason) return;

  const scopeCondition =
    target.vacancyReason === "RESIGNATION"
      ? and(eq(employeeScheduleTemplates.employeeId, target.employeeId), eq(employeeScheduleTemplates.vacancyReason, "RESIGNATION"))
      : and(
          eq(employeeScheduleTemplates.employeeId, target.employeeId),
          eq(employeeScheduleTemplates.positionId, target.positionId),
          eq(employeeScheduleTemplates.vacancyReason, target.vacancyReason)
        );

  await db.update(employeeScheduleTemplates).set({ vacancyReason: null, vacancyStartsOn: null }).where(scopeCondition);
  revalidatePath("/schedule/templates");
}

/* ---------------------------------------------------------------------- */
/* Phase 1 redesign (2026-08-12) — bulk position/employee pattern editor   */
/* ---------------------------------------------------------------------- */

/** Diff-and-sync one (employeeId, positionId) pair's weekly pattern
 * against a submitted set of checked day/period cells — the write side of
 * the new Position -> pick person -> Mon-Sun checkbox grid on
 * /schedule/templates. Same "diff against what's stored, only touch what
 * changed" spirit as updateStaffingTargets, but scoped to one
 * employee+position pair instead of the whole table, since that's the
 * unit the new UI edits at a time.
 *
 * Checked box with no existing row -> create (or reactivate a previously
 * retired row at that exact slot, since the unique index on
 * (employeeId, positionId, dayOfWeek, period) doesn't include `active` —
 * same reasoning as createTemplateAssignment's reactivate path).
 * Unchecked box that had an active row -> retire it immediately, no
 * vacancy warning — this is the direct replacement for the old
 * single-row "drop just this one day" case. */
export async function syncEmployeePositionTemplate(
  employeeId: number,
  positionId: number,
  cells: { dayOfWeek: number; period: "Lunch" | "Dinner" }[]
) {
  const existing = await db
    .select()
    .from(employeeScheduleTemplates)
    .where(and(eq(employeeScheduleTemplates.employeeId, employeeId), eq(employeeScheduleTemplates.positionId, positionId)));

  const activeExisting = existing.filter((r) => r.active);
  const key = (dayOfWeek: number, period: string) => `${dayOfWeek}-${period}`;
  const wantedKeys = new Set(cells.map((c) => key(c.dayOfWeek, c.period)));

  const toRetire = activeExisting.filter((r) => !wantedKeys.has(key(r.dayOfWeek, r.period)));
  for (const r of toRetire) {
    await db.update(employeeScheduleTemplates).set({ active: false }).where(eq(employeeScheduleTemplates.id, r.id));
  }

  const activeKeys = new Set(activeExisting.map((r) => key(r.dayOfWeek, r.period)));
  const toAdd = cells.filter((c) => !activeKeys.has(key(c.dayOfWeek, c.period)));
  for (const c of toAdd) {
    const inactiveMatch = existing.find((r) => !r.active && r.dayOfWeek === c.dayOfWeek && r.period === c.period);
    if (inactiveMatch) {
      await db
        .update(employeeScheduleTemplates)
        .set({ active: true, vacancyReason: null, vacancyStartsOn: null })
        .where(eq(employeeScheduleTemplates.id, inactiveMatch.id));
    } else {
      await db.insert(employeeScheduleTemplates).values({
        employeeId,
        positionId,
        dayOfWeek: c.dayOfWeek,
        period: c.period,
        active: true,
      });
    }
  }

  revalidatePath("/schedule/templates");
}

/** Kebab-menu "Retire from this position" — immediately retires every
 * active row for this employee+position pair, no advance-notice vacancy
 * flag. Distinct from "Mark vacating": this is for cleaning up a mistake
 * or an already-effective change, not flagging a future departure. */
export async function retireEmployeeFromPosition(employeeId: number, positionId: number) {
  await db
    .update(employeeScheduleTemplates)
    .set({ active: false })
    .where(and(eq(employeeScheduleTemplates.employeeId, employeeId), eq(employeeScheduleTemplates.positionId, positionId), eq(employeeScheduleTemplates.active, true)));
  revalidatePath("/schedule/templates");
}

/* ---------------------------------------------------------------------- */
/* Phase 2 — Weekly Plan                                                   */
/* ---------------------------------------------------------------------- */

/** Creates a draft scheduleWeeks row (if one doesn't already exist for
 * this Monday) and pre-fills it from the active template. Deliberately a
 * no-op if the week already exists — re-running this against an
 * already-generated week would either violate the unique index (a
 * template row already seeded) or silently duplicate nothing useful, so
 * the UI only shows the "Generate" button when loadWeeklyPlan returns
 * week: null.
 *
 * A template row is SKIPPED for a given date if:
 *   - effectiveFrom is set and later than that date (not yet in effect), or
 *   - vacancyStartsOn is set and on/before that date (Oliver's RED case —
 *     the employee isn't expected to fill this slot from that date on,
 *     so the slot is deliberately left open here rather than auto-filled
 *     with someone who's leaving; that's what makes the resulting gap
 *     visible against the staffing target on the grid).
 */
export async function generateWeekFromTemplate(weekStartDate: string) {
  const [existing] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.weekStartDate, weekStartDate));
  if (existing) return;

  const [week] = await db.insert(scheduleWeeks).values({ weekStartDate, status: "draft" }).returning();

  const templateRows = await db.select().from(employeeScheduleTemplates).where(eq(employeeScheduleTemplates.active, true));

  const projected = projectAssignmentsForWeek(
    weekStartDate,
    templateRows.map((t) => ({
      employeeId: t.employeeId,
      positionId: t.positionId,
      dayOfWeek: t.dayOfWeek,
      period: t.period as "Lunch" | "Dinner",
      effectiveFrom: t.effectiveFrom,
      vacancyStartsOn: t.vacancyStartsOn,
    }))
  );

  const rows = projected.map((p) => ({ ...p, weekId: week.id, sourceType: "FROM_TEMPLATE" as const }));

  if (rows.length > 0) {
    await db.insert(plannedShiftAssignments).values(rows);
  }

  revalidatePath("/schedule/plan");
}

export interface PlannedAssignmentActionState {
  error: string | null;
}

/** Manager's manual exception to the template — e.g. an extra body for
 * an anticipated busy day (isExtraCoverage=true, YELLOW), or filling a
 * gap left by a vacating employee. */
export async function addPlannedAssignment(
  _prevState: PlannedAssignmentActionState,
  formData: FormData
): Promise<PlannedAssignmentActionState> {
  try {
    const weekId = Number(formData.get("weekId"));
    const employeeId = Number(formData.get("employeeId"));
    const positionId = Number(formData.get("positionId"));
    const date = String(formData.get("date") ?? "");
    const period = String(formData.get("period") ?? "");
    const isExtraCoverage = formData.get("isExtraCoverage") === "on";

    if (!weekId) throw new Error("Missing week");
    if (!employeeId) throw new Error("Employee is required");
    if (!positionId) throw new Error("Position is required");
    if (!date) throw new Error("Date is required");
    if (period !== "Lunch" && period !== "Dinner") throw new Error("Period must be Lunch or Dinner");

    const [existing] = await db
      .select()
      .from(plannedShiftAssignments)
      .where(
        and(
          eq(plannedShiftAssignments.weekId, weekId),
          eq(plannedShiftAssignments.employeeId, employeeId),
          eq(plannedShiftAssignments.positionId, positionId),
          eq(plannedShiftAssignments.date, date),
          eq(plannedShiftAssignments.period, period)
        )
      );
    if (existing) throw new Error("This person is already assigned to this slot");

    await db.insert(plannedShiftAssignments).values({
      weekId,
      employeeId,
      positionId,
      date,
      period,
      sourceType: "MANUAL_ADD",
      isExtraCoverage,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/schedule/plan");
  return { error: null };
}

export interface AutoFillSkippedSlot {
  positionName: string;
  date: string;
  period: "Lunch" | "Dinner";
  missing: number;
}

export interface AutoFillActionState {
  error: string | null;
  summary?: { filled: number; totalSkipped: number; skipped: AutoFillSkippedSlot[] };
}

/** "Auto-fill" button on the Weekly Plan (2026-08-15, Oliver's ask) --
 * fills every currently under-target position/date/period slot for the
 * whole week in one click. Deliberately dumb for now, no smart criteria
 * beyond the two hard rules Oliver's given so far -- more can be added
 * later once he's decided what he wants ("no criteria or rules but i
 * will add it up later ... we will disscuss about that later").
 *
 *   1. Primary position first, then multi-position, NEVER unsuitable
 *      (2026-08-15 fix -- Oliver caught Gunner, whose primary role is
 *      Bag Handler and has zero cooking training, auto-filled into Head
 *      Chef by the original version's "fallback to any active
 *      employee" tier). Two ordered tiers, no third: tier 1 is
 *      employees whose PRIMARY position (employees.primaryPositionId)
 *      is this one; tier 2 is employees cross-trained for it via
 *      Employee admin (employeePositions) but it isn't their primary.
 *      If neither tier has anyone free that day, the slot is left
 *      unfilled and reported in the skip summary -- it will NEVER place
 *      someone who isn't linked to that position at all, no matter how
 *      short-staffed the day is.
 *   2. Never the same person twice in one calendar day -- a person can
 *      be placed into at most one slot per date by this action, across
 *      BOTH periods and every position, not just within one period.
 *      Counts their existing assignments that date (from before this
 *      run) AND whatever auto-fill itself has already placed earlier in
 *      the same run, so it never double-books someone against itself.
 *
 * Tie-break among multiple candidates within the same tier: whoever has
 * the fewest shifts so far this week gets picked, so hours spread out
 * reasonably even with no other rules yet. Ties within that broken
 * alphabetically by name, for a deterministic result.
 *
 * Never touches an existing assignment -- only adds new rows for the
 * shortfall (target - current headcount) in each slot. New rows are
 * tagged sourceType "AUTO_FILL" (vs. FROM_TEMPLATE / MANUAL_ADD) purely
 * for future traceability -- they behave exactly like a manual add
 * otherwise (same remove button, same double-booking badge logic
 * elsewhere in the grid, etc). */
export async function autoFillWeek(weekId: number): Promise<AutoFillActionState> {
  try {
    const session = await getCurrentStaffSession();
    if (!session) return { error: "You've been signed out -- sign in again" };

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));
    if (!week) return { error: "That week no longer exists" };

    const dates = datesInWeek(week.weekStartDate);

    const activePositions = await db.select().from(positions).where(eq(positions.active, true));
    if (activePositions.length === 0) {
      return { error: null, summary: { filled: 0, totalSkipped: 0, skipped: [] } };
    }

    const targetRows = await db.select().from(positionStaffingTargets);
    const targetByKey = new Map<string, number>();
    for (const t of targetRows) targetByKey.set(`${t.positionId}:${t.dayOfWeek}:${t.period}`, t.targetCount);

    const activeEmployees = await db.select().from(employees).where(eq(employees.active, true));
    if (activeEmployees.length === 0) {
      return { error: null, summary: { filled: 0, totalSkipped: 0, skipped: [] } };
    }

    // Two separate tiers, never merged -- 2026-08-15 fix after Oliver
    // caught Gunner (primary Bag Handler, not remotely a cook) getting
    // auto-filled into Head Chef by the old "fallback to any active
    // employee" tier. His rule: "fill only primary position first and
    // then fill with people who can do multi position. never add a
    // person auto fill person who is not suitable to positions." So:
    //   tier 1 -- employees whose PRIMARY position is this one.
    //   tier 2 -- employees cross-trained for this position via Employee
    //     admin (employeePositions) but it isn't their primary role.
    // There is deliberately no tier 3 anymore -- if neither tier has
    // anyone free that day, the slot is left unfilled and reported in
    // the skip summary instead of grabbing an unrelated person.
    const employeePositionRows = await db.select().from(employeePositions);
    const primaryByPosition = new Map<number, Set<number>>();
    for (const e of activeEmployees) {
      if (e.primaryPositionId === null) continue;
      if (!primaryByPosition.has(e.primaryPositionId)) primaryByPosition.set(e.primaryPositionId, new Set());
      primaryByPosition.get(e.primaryPositionId)!.add(e.id);
    }
    const secondaryByPosition = new Map<number, Set<number>>();
    for (const row of employeePositionRows) {
      if (!secondaryByPosition.has(row.positionId)) secondaryByPosition.set(row.positionId, new Set());
      secondaryByPosition.get(row.positionId)!.add(row.employeeId);
    }

    const existingAssignments = await db
      .select()
      .from(plannedShiftAssignments)
      .where(eq(plannedShiftAssignments.weekId, weekId));

    // date -> Set<employeeId> already used that date (both periods, every position)
    const usedToday = new Map<string, Set<number>>();
    for (const d of dates) usedToday.set(d, new Set());
    for (const a of existingAssignments) usedToday.get(a.date)?.add(a.employeeId);

    // employeeId -> assignments so far this week (existing + newly placed in this run)
    const countThisWeek = new Map<number, number>();
    for (const e of activeEmployees) countThisWeek.set(e.id, 0);
    for (const a of existingAssignments) {
      countThisWeek.set(a.employeeId, (countThisWeek.get(a.employeeId) ?? 0) + 1);
    }

    // `${positionId}:${date}:${period}` -> current headcount already assigned
    const currentCount = new Map<string, number>();
    for (const a of existingAssignments) {
      const key = `${a.positionId}:${a.date}:${a.period}`;
      currentCount.set(key, (currentCount.get(key) ?? 0) + 1);
    }

    const newRows: {
      weekId: number;
      employeeId: number;
      positionId: number;
      date: string;
      period: "Lunch" | "Dinner";
      sourceType: "AUTO_FILL";
      isExtraCoverage: boolean;
    }[] = [];
    const skipped: AutoFillSkippedSlot[] = [];
    let filled = 0;

    for (const date of dates) {
      const dow = dayOfWeek(date);
      for (const period of PERIODS) {
        for (const position of activePositions) {
          const target = targetByKey.get(`${position.id}:${dow}:${period}`) ?? 0;
          if (target <= 0) continue;

          const key = `${position.id}:${date}:${period}`;
          let need = target - (currentCount.get(key) ?? 0);
          if (need <= 0) continue;

          const usedSet = usedToday.get(date)!;
          const primarySet = primaryByPosition.get(position.id) ?? new Set<number>();
          const secondarySet = secondaryByPosition.get(position.id) ?? new Set<number>();

          while (need > 0) {
            let candidates = activeEmployees.filter((e) => primarySet.has(e.id) && !usedSet.has(e.id));
            if (candidates.length === 0) {
              candidates = activeEmployees.filter((e) => secondarySet.has(e.id) && !primarySet.has(e.id) && !usedSet.has(e.id));
            }
            if (candidates.length === 0) {
              skipped.push({ positionName: position.name, date, period, missing: need });
              break;
            }

            candidates.sort((a, b) => {
              const ca = countThisWeek.get(a.id) ?? 0;
              const cb = countThisWeek.get(b.id) ?? 0;
              if (ca !== cb) return ca - cb;
              return a.nickname.localeCompare(b.nickname);
            });
            const chosen = candidates[0];

            newRows.push({
              weekId,
              employeeId: chosen.id,
              positionId: position.id,
              date,
              period,
              sourceType: "AUTO_FILL",
              isExtraCoverage: false,
            });
            usedSet.add(chosen.id);
            countThisWeek.set(chosen.id, (countThisWeek.get(chosen.id) ?? 0) + 1);
            currentCount.set(key, (currentCount.get(key) ?? 0) + 1);
            filled++;
            need--;
          }
        }
      }
    }

    if (newRows.length > 0) {
      await db.insert(plannedShiftAssignments).values(newRows);
    }

    revalidatePath("/schedule/plan");
    const totalSkipped = skipped.reduce((sum, s) => sum + s.missing, 0);
    return { error: null, summary: { filled, totalSkipped, skipped } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 2026-08-14, Oliver-reported: he pulled Nancy off a published
 * Tuesday using this button (the small x next to a name in the
 * grid -- the ORIGINAL single-assignment remove, predates the whole
 * danger-zone logging system) and no entry showed up on her "Recent
 * changes." Root cause: this action never wrote to
 * scheduleChangeLog at all -- only clearDay/deleteWeek did. Fixed
 * here: fetches the assignment BEFORE deleting (need its details
 * for the log), deletes it, then logs automatically -- no typed
 * confirm, no reason required, unlike the bulk actions -- if the
 * week it belonged to was PUBLISHED. Draft-week removals stay
 * silent, same convention as clearDay/deleteWeek. Reasoning for the
 * lighter touch here: this is a routine, frequent, single-person
 * edit (used constantly for ordinary schedule fixes), not a "wipe a
 * day/week" action -- the same friction that's appropriate for a
 * bulk nuke would make this button annoying for its actual, common
 * use.
 */
export async function removePlannedAssignment(assignmentId: number) {
  const [assignment] = await db
    .select({
      weekId: plannedShiftAssignments.weekId,
      employeeId: plannedShiftAssignments.employeeId,
      positionId: plannedShiftAssignments.positionId,
      date: plannedShiftAssignments.date,
      period: plannedShiftAssignments.period,
    })
    .from(plannedShiftAssignments)
    .where(eq(plannedShiftAssignments.id, assignmentId));

  if (!assignment) return; // already gone -- nothing to remove or log

  await db.delete(plannedShiftAssignments).where(eq(plannedShiftAssignments.id, assignmentId));

  const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, assignment.weekId));
  const session = await getCurrentStaffSession();
  if (week?.status === "published" && session) {
    await logScheduleChange({
      weekId: assignment.weekId,
      weekStartDate: week.weekStartDate,
      action: "REMOVED_ASSIGNMENT",
      date: assignment.date,
      wasPublished: true,
      reason: null,
      performedBy: { id: session.id, name: session.name },
      rows: [
        {
          employeeId: assignment.employeeId,
          positionId: assignment.positionId,
          date: assignment.date,
          period: assignment.period as "Lunch" | "Dinner",
        },
      ],
    });
  }

  revalidatePath("/schedule/plan");
  revalidatePath("/schedule/weeks");
  revalidatePath("/me/schedule");
}

/** Publishing is what makes a week visible on staff's own schedule view
 * (a later phase) — draft weeks are manager-only. No un-publish for v1;
 * not asked for. */
export async function publishWeek(weekId: number) {
  await db
    .update(scheduleWeeks)
    .set({ status: "published", publishedAt: new Date().toISOString() })
    .where(eq(scheduleWeeks.id, weekId));
  revalidatePath("/schedule/plan");
}

export interface DangerZoneActionState {
  error: string | null;
}

interface RemovedAssignmentSnapshot {
  employeeId: number;
  employeeName: string;
  positionId: number;
  positionName: string;
  date: string;
  period: "Lunch" | "Dinner";
}

/** Snapshots the given assignment rows into removedAssignments' JSON
 * shape (with readable names, not just ids) BEFORE they're deleted, and
 * writes one scheduleChangeLog row -- shared by clearDay and deleteWeek
 * below. Takes the already-loaded employee/position name maps rather
 * than re-querying per row. */
async function logScheduleChange(params: {
  weekId: number;
  weekStartDate: string;
  action: "CLEARED_DAY" | "DELETED_WEEK" | "REMOVED_ASSIGNMENT";
  date: string | null;
  wasPublished: boolean;
  reason: string | null;
  performedBy: { id: number; name: string };
  rows: { employeeId: number; positionId: number; date: string; period: "Lunch" | "Dinner" }[];
}) {
  if (params.rows.length === 0) return; // nothing was actually removed -- don't log a no-op

  const [employeeRows, positionRows] = await Promise.all([
    db.select({ id: employees.id, name: employees.nickname }).from(employees),
    db.select({ id: positions.id, name: positions.name }).from(positions),
  ]);
  const employeeNameById = new Map(employeeRows.map((e) => [e.id, e.name]));
  const positionNameById = new Map(positionRows.map((p) => [p.id, p.name]));

  const removedAssignments: RemovedAssignmentSnapshot[] = params.rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: employeeNameById.get(r.employeeId) ?? "Unknown",
    positionId: r.positionId,
    positionName: positionNameById.get(r.positionId) ?? "Unknown",
    date: r.date,
    period: r.period,
  }));

  await db.insert(scheduleChangeLog).values({
    weekId: params.weekId,
    weekStartDate: params.weekStartDate,
    action: params.action,
    date: params.date,
    wasPublished: params.wasPublished,
    reason: params.reason,
    performedByEmployeeId: params.performedBy.id,
    performedByName: params.performedBy.name,
    removedAssignments: JSON.stringify(removedAssignments),
  });
}

/** Clears every assignment (any position, any period) for ONE date
 * within a week -- "delete draft day," 2026-08-14, Oliver. Leaves the
 * week record and every other date in it untouched.
 *
 * 2026-08-14 follow-up, same day: dropped the PIN re-check Oliver first
 * asked for -- his own words, "pin might not be the answer" for a small
 * restaurant where one manager realistically does everything, a PIN
 * doesn't prove much. Replaced with two things instead: typing the
 * literal word CLEAR to confirm (friction against a misclick, not
 * against an impostor -- Oliver's own framing: "works too as a
 * friction but not catching cheat," which he was fine with), and a
 * REQUIRED reason when the day being cleared was already published
 * (staff may have already seen it -- draft clears don't need one,
 * nobody outside management has seen a draft yet). Every clear is
 * logged via logScheduleChange regardless, so "at least they know
 * what is happening with their shift" per Oliver. */
/** 2026-08-14, added after the first version of this catch just did
 * e.message and Oliver got an unhelpfully generic "Failed query: ..."
 * string with no actual reason (a known lossy-error-detail pattern
 * with @libsql/client over Turso's HTTP protocol -- see this file's
 * git history / PROGRESS.md for prior Turso-specific gotchas). Pulls
 * out .code and .cause too, if present, so the NEXT time something
 * fails here there's an actual chance of diagnosing it from the
 * on-screen message alone instead of needing a follow-up round trip. */
function describeScheduleActionError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const parts = [e.message];
  const code = (e as { code?: unknown }).code;
  if (code) parts.push(`code: ${String(code)}`);
  const cause = (e as { cause?: unknown }).cause;
  if (cause) parts.push(`cause: ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`);
  return parts.join(" | ");
}

export async function clearDay(
  _prevState: DangerZoneActionState,
  formData: FormData
): Promise<DangerZoneActionState> {
  const weekId = Number(formData.get("weekId"));
  const date = String(formData.get("date") ?? "");
  const confirmWord = String(formData.get("confirmWord") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!weekId) return { error: "Missing week" };
  if (!date) return { error: "Pick a date" };
  if (confirmWord.toUpperCase() !== "CLEAR") return { error: 'Type CLEAR (all caps) to confirm' };

  // 2026-08-14, same day as the rest of the danger zone -- wrapped in
  // try/catch (matching addPlannedAssignment's existing pattern
  // elsewhere in this file) after a real production incident: without
  // this, ANY thrown error here (e.g. the schedule_change_log table
  // not existing yet because the migration hadn't been applied) surfaced
  // as Next.js's generic "This page couldn't load" error screen instead
  // of a message inside the form. Now it always resolves to a readable
  // inline error instead of crashing the page.
  try {
    const session = await getCurrentStaffSession();
    if (!session) return { error: "You've been signed out -- sign in again" };

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));
    if (!week) return { error: "That week no longer exists" };
    const wasPublished = week.status === "published";
    if (wasPublished && !reason) return { error: "This day is already published -- add a short reason before clearing it" };

    const rowsToRemove = await db
      .select({
        employeeId: plannedShiftAssignments.employeeId,
        positionId: plannedShiftAssignments.positionId,
        date: plannedShiftAssignments.date,
        period: plannedShiftAssignments.period,
      })
      .from(plannedShiftAssignments)
      .where(and(eq(plannedShiftAssignments.weekId, weekId), eq(plannedShiftAssignments.date, date)));

    await db
      .delete(plannedShiftAssignments)
      .where(and(eq(plannedShiftAssignments.weekId, weekId), eq(plannedShiftAssignments.date, date)));

    await logScheduleChange({
      weekId,
      weekStartDate: week.weekStartDate,
      action: "CLEARED_DAY",
      date,
      wasPublished,
      reason: reason || null,
      performedBy: { id: session.id, name: session.name },
      rows: rowsToRemove.map((r) => ({ ...r, period: r.period as "Lunch" | "Dinner" })),
    });
  } catch (e) {
    return { error: describeScheduleActionError(e) };
  }

  revalidatePath("/schedule/plan");
  revalidatePath("/schedule/weeks");
  revalidatePath("/me/schedule");
  return { error: null };
}

/** Full reset of a week -- "delete draft week," 2026-08-14, Oliver:
 * removes every plannedShiftAssignment in it AND the scheduleWeeks row
 * itself, back to "Not planned" as if "Generate from template" was
 * never clicked. Same typed-word-instead-of-PIN + required-reason-if-
 * published + change log as clearDay above -- see its comment for the
 * reasoning, all decided together in the same conversation. */
export async function deleteWeek(
  _prevState: DangerZoneActionState,
  formData: FormData
): Promise<DangerZoneActionState> {
  const weekId = Number(formData.get("weekId"));
  const confirmWord = String(formData.get("confirmWord") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!weekId) return { error: "Missing week" };
  if (confirmWord.toUpperCase() !== "DELETE") return { error: 'Type DELETE (all caps) to confirm' };

  // Same try/catch reasoning as clearDay above -- a thrown error here
  // (e.g. a not-yet-applied migration) used to crash straight to
  // Next.js's generic error page instead of showing a message.
  try {
    const session = await getCurrentStaffSession();
    if (!session) return { error: "You've been signed out -- sign in again" };

    const [week] = await db.select().from(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));
    if (!week) return { error: "That week no longer exists" };
    const wasPublished = week.status === "published";
    if (wasPublished && !reason) return { error: "This week is already published -- add a short reason before deleting it" };

    const rowsToRemove = await db
      .select({
        employeeId: plannedShiftAssignments.employeeId,
        positionId: plannedShiftAssignments.positionId,
        date: plannedShiftAssignments.date,
        period: plannedShiftAssignments.period,
      })
      .from(plannedShiftAssignments)
      .where(eq(plannedShiftAssignments.weekId, weekId));

    await db.delete(plannedShiftAssignments).where(eq(plannedShiftAssignments.weekId, weekId));
    await db.delete(scheduleWeeks).where(eq(scheduleWeeks.id, weekId));

    await logScheduleChange({
      weekId,
      weekStartDate: week.weekStartDate,
      action: "DELETED_WEEK",
      date: null,
      wasPublished,
      reason: reason || null,
      performedBy: { id: session.id, name: session.name },
      rows: rowsToRemove.map((r) => ({ ...r, period: r.period as "Lunch" | "Dinner" })),
    });
  } catch (e) {
    return { error: describeScheduleActionError(e) };
  }

  revalidatePath("/schedule/plan");
  revalidatePath("/schedule/weeks");
  revalidatePath("/me/schedule");

  // Oliver, 2026-08-14: after a delete, land on the Weeks list instead
  // of the now-empty week's own plan page -- that week no longer
  // exists, so /schedule/weeks (which shows every week's planned/
  // draft/published status at a glance) is a more useful place to
  // land than a page that's just going to say "not planned." Changed
  // from an earlier version that redirected back to /schedule/plan?
  // week=<the deleted week>. redirect() throws internally by design,
  // so it stays outside the try/catch above -- same reasoning as
  // clearDay/deleteWeek's error handling.
  redirect("/schedule/weeks");
}
