"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  employeeScheduleTemplates,
  positionStaffingTargets,
  positions,
  scheduleWeeks,
  plannedShiftAssignments,
} from "@/db/schema";
import { projectAssignmentsForWeek } from "@/lib/schedule/projectTemplate";

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

export async function removePlannedAssignment(assignmentId: number) {
  await db.delete(plannedShiftAssignments).where(eq(plannedShiftAssignments.id, assignmentId));
  revalidatePath("/schedule/plan");
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
