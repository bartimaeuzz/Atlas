import { db } from "@/db/client";
import { positions, positionStaffingTargets } from "@/db/schema";

export interface StaffingTargetPosition {
  id: number;
  name: string;
  category: "FOH" | "BOH";
}

export interface StaffingTargetsData {
  /** Active positions only — retired positions don't need staffing
   * targets, same reasoning as every other "active only" filter in this
   * app (roster add-someone, position dropdowns). */
  positions: StaffingTargetPosition[];
  /** Sparse lookup, key = `${positionId}:${dayOfWeek}:${period}`. Missing
   * key means target 0 (nobody scheduled by default) — same "absence
   * means the default" convention as the rest of this schema (e.g. a
   * missing shiftRates row). */
  targets: Record<string, number>;
}

/** Powers /schedule/targets — the "how many of this Position do we need,
 * this day, this period?" grid. Confirmed with Oliver against a real
 * reference schedule (Soothr LIC): the numbered position rows on a real
 * restaurant's schedule (Runner 1/2/3/4 etc.) are exactly this — a
 * headcount target, not distinct job titles. See
 * Atlas_Schedule_Planner_Schema_v1.md for the full design. */
export async function loadStaffingTargets(): Promise<StaffingTargetsData> {
  const allPositions = await db.select().from(positions);
  const activePositions = allPositions
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, category: p.category as "FOH" | "BOH" }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));

  const targetRows = await db.select().from(positionStaffingTargets);
  const targets: Record<string, number> = {};
  for (const row of targetRows) {
    targets[`${row.positionId}:${row.dayOfWeek}:${row.period}`] = row.targetCount;
  }

  return { positions: activePositions, targets };
}
