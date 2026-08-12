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

export interface TemplateActionState {
  error: string | null;
}

function readTemplateForm(formData: FormData) {
  const employeeId = Number(formData.get("employeeId"));
  const positionId = Number(formData.get("positionId"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const period = String(formData.get("period") ?? "");

  if (!employeeId) throw new Error("Employee is required");
  if (!positionId) throw new Error("Position is required");
  if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) throw new Error("Invalid day of week");
  if (period !== "Lunch" && period !== "Dinner") throw new Error("Period must be Lunch or Dinner");

  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "").trim();

  return {
    employeeId,
    positionId,
    dayOfWeek,
    period: period as "Lunch" | "Dinner",
    effectiveFrom: effectiveFromRaw || null,
  };
}

/** Note on the unique index (employeeId, positionId, dayOfWeek, period):
 * it does NOT include `active`, so the same employee can't be re-added to
 * the exact slot they were previously retired from without reactivating
 * the old row instead — an accepted edge case for v1 (retiring and
 * re-adding a DIFFERENT employee to a slot works fine, since employeeId
 * differs). See db/schema.ts's comment on employeeScheduleTemplates. */
export async function createTemplateAssignment(
  _prevState: TemplateActionState,
  formData: FormData
): Promise<TemplateActionState> {
  try {
    const parsed = readTemplateForm(formData);

    const [existing] = await db
      .select()
      .from(employeeScheduleTemplates)
      .where(
        and(
          eq(employeeScheduleTemplates.employeeId, parsed.employeeId),
          eq(employeeScheduleTemplates.positionId, parsed.positionId),
          eq(employeeScheduleTemplates.dayOfWeek, parsed.dayOfWeek),
          eq(employeeScheduleTemplates.period, parsed.period)
        )
      );

    if (existing && existing.active) {
      throw new Error("This employee already has an active template assignment for this position, day, and period");
    }
    if (existing && !existing.active) {
      // Reactivating the same slot for the same employee — simplest path
      // given the unique index, and a legitimate case (someone returning
      // to a slot they'd previously left).
      await db
        .update(employeeScheduleTemplates)
        .set({ active: true, effectiveFrom: parsed.effectiveFrom, vacancyReason: null, vacancyStartsOn: null })
        .where(eq(employeeScheduleTemplates.id, existing.id));
    } else {
      await db.insert(employeeScheduleTemplates).values({
        employeeId: parsed.employeeId,
        positionId: parsed.positionId,
        dayOfWeek: parsed.dayOfWeek,
        period: parsed.period,
        effectiveFrom: parsed.effectiveFrom,
        active: true,
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/schedule/templates");
  return { error: null };
}

/** Retire, don't hard-delete — same convention as positions.active. Plain
 * (non-form-state) action, just a button, same pattern as
 * togglePositionActive. */
export async function retireTemplateAssignment(templateId: number) {
  await db.update(employeeScheduleTemplates).set({ active: false }).where(eq(employeeScheduleTemplates.id, templateId));
  revalidatePath("/schedule/templates");
}

/** Sets the RED vacancy flag — confirmed with Oliver this means
 * resignation notice or a promotion/transfer, NOT an open swap request.
 * See db/schema.ts's comment on vacancyReason for the full reasoning.
 *
 * Scope by reason (2026-08-11, Oliver — clarified after testing on
 * himself with a real resignation): marking ONE row as vacating
 * shouldn't mean only that one shift is affected when the real-world
 * event is bigger than that:
 *   - RESIGNATION: the person is leaving entirely, so every active
 *     template row for that employeeId gets flagged, regardless of
 *     position/day/period.
 *   - PROMOTION: they're moving out of THIS position specifically
 *     (might keep other roles), so every active row for that
 *     employeeId + positionId gets flagged, across all their days.
 *   - OTHER: stays scoped to just the clicked row — this is the "an
 *     employee asked to permanently drop this one recurring shift, not
 *     resigning" case Oliver asked about. A single row is exactly what
 *     that needs. */
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
      : vacancyReason === "PROMOTION"
        ? and(
            eq(employeeScheduleTemplates.employeeId, target.employeeId),
            eq(employeeScheduleTemplates.positionId, target.positionId),
            eq(employeeScheduleTemplates.active, true)
          )
        : eq(employeeScheduleTemplates.id, templateId);

  await db.update(employeeScheduleTemplates).set({ vacancyReason, vacancyStartsOn }).where(scopeCondition);
  revalidatePath("/schedule/templates");
}

/** Mirrors setTemplateVacancy's scope, read from the row's CURRENT
 * reason before clearing — so undoing a resignation clears every row
 * it flagged, not just the one you happened to click "Clear" on. Only
 * clears rows that still have that same reason, so it can't
 * accidentally wipe out an unrelated OTHER-reason flag on a different
 * row for the same employee. */
export async function clearTemplateVacancy(templateId: number) {
  const [target] = await db.select().from(employeeScheduleTemplates).where(eq(employeeScheduleTemplates.id, templateId));
  if (!target) return;

  const scopeCondition =
    target.vacancyReason === "RESIGNATION"
      ? and(eq(employeeScheduleTemplates.employeeId, target.employeeId), eq(employeeScheduleTemplates.vacancyReason, "RESIGNATION"))
      : target.vacancyReason === "PROMOTION"
        ? and(
            eq(employeeScheduleTemplates.employeeId, target.employeeId),
            eq(employeeScheduleTemplates.positionId, target.positionId),
            eq(employeeScheduleTemplates.vacancyReason, "PROMOTION")
          )
        : eq(employeeScheduleTemplates.id, templateId);

  await db.update(employeeScheduleTemplates).set({ vacancyReason: null, vacancyStartsOn: null }).where(scopeCondition);
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
