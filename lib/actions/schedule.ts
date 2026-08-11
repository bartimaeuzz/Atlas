"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeScheduleTemplates, positionStaffingTargets, positions } from "@/db/schema";

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
 * See db/schema.ts's comment on vacancyReason for the full reasoning. */
export async function setTemplateVacancy(
  templateId: number,
  vacancyReason: "RESIGNATION" | "PROMOTION" | "OTHER",
  vacancyStartsOn: string
) {
  await db
    .update(employeeScheduleTemplates)
    .set({ vacancyReason, vacancyStartsOn })
    .where(eq(employeeScheduleTemplates.id, templateId));
  revalidatePath("/schedule/templates");
}

export async function clearTemplateVacancy(templateId: number) {
  await db
    .update(employeeScheduleTemplates)
    .set({ vacancyReason: null, vacancyStartsOn: null })
    .where(eq(employeeScheduleTemplates.id, templateId));
  revalidatePath("/schedule/templates");
}
