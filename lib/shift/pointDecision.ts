import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings } from "@/db/schema";
import { loadShiftCalcData, type TipPoolGroup } from "@/lib/shift/loadRosterForCalc";

/** Which pools currently split by points. A point entered against an
 * equal-split pool is an inert control that lies, so nothing here — the
 * gate included — ever applies to one. */
export function resolvePointWeightedPools(settings: {
  pool1SplitMethod?: string | null;
  pool2SplitMethod?: string | null;
  pool3SplitMethod?: string | null;
} | undefined): TipPoolGroup[] {
  return (
    [
      ["POOL_1_DINE_IN", settings?.pool1SplitMethod ?? "POINT_WEIGHTED"],
      ["POOL_2_TAKEOUT_ONLINE", settings?.pool2SplitMethod ?? "POINT_WEIGHTED"],
      ["POOL_3_DELIVERY", settings?.pool3SplitMethod ?? "EQUAL_SPLIT"],
    ] as const
  )
    .filter(([, m]) => m === "POINT_WEIGHTED")
    .map(([g]) => g);
}

export interface PointDecisionCandidate {
  hasStandingPoint: boolean;
  tipPoolGroups: TipPoolGroup[];
  pointDecidedAt: string | null;
  /** An explicit stored override counts as a decision on its own -- see
   * needsPointDecision. Optional so callers predating it still typecheck. */
  hasExplicitOverride?: boolean;
}

/**
 * True when this roster row's tip point is still nobody's decision
 * (2026-08-29, Oliver's call after Aey's first test session).
 *
 * Placing someone in a position they hold no EmployeePosition row for is a
 * legitimate, everyday thing — a delivery guy covering a server shift when
 * someone calls in sick. We deliberately do NOT block that: a block on the
 * roster is satisfied fastest by adding the person to that position
 * permanently, which would quietly turn every one-off cover into a standing
 * qualification and corrupt every future picker and plan.
 *
 * What we block instead is the silent number. With no EmployeePosition row
 * there is no standing point, so the resolution chain falls through to its
 * bare 1.0 fallback — a full share of a point-weighted pool that nobody
 * chose. So the placement is free and the POINT is what must be decided,
 * at close, by the person who watched the shift.
 *
 * Deliberately narrow, three ways:
 *   - Only rows with no standing point. Someone who already holds the
 *     position has a decided value and doesn't re-decide it.
 *   - Only rows in a POINT-WEIGHTED pool. In an equal-split pool the point
 *     changes nothing, so demanding one would be theatre.
 *   - Only until decided once. pointDecidedAt is a separate column precisely
 *     because the decision cannot be read back off the value: the override
 *     columns store null when the submitted number equals the resolved
 *     standing value, so a manager deliberately confirming 1.0 is
 *     byte-identical to nobody having touched the row at all.
 */
export function needsPointDecision(
  row: PointDecisionCandidate,
  pointWeightedPools: TipPoolGroup[]
): boolean {
  if (row.hasStandingPoint) return false;
  if (row.pointDecidedAt != null) return false;
  // A stored override is a decision someone already made, stamp or no
  // stamp. This matters for rows created before pointDecidedAt existed:
  // without it, shift 31's Kris (Busser, 0.5 already saved) would be
  // blocked on prod and asked to re-decide a point that was decided.
  // Safe because the stamp is only needed to disambiguate a value that
  // was null'd for equalling the fallback -- a NON-null override never
  // had that ambiguity.
  if (row.hasExplicitOverride) return false;
  return row.tipPoolGroups.some((g) => pointWeightedPools.includes(g));
}

export interface UndecidedPointRow {
  rosterEntryId: number;
  employeeName: string;
  positionName: string;
}

/** Every roster row on this shift whose tip point is still undecided.
 * One query behind three callers -- the Preview page's banner, its
 * disabled Finalize button, and runFinalize's server-side gate -- so a
 * disabled button and a refused action can never disagree about who is
 * blocking the shift. */
export async function loadUndecidedPointRows(shiftId: number): Promise<UndecidedPointRow[]> {
  const [settings] = await db
    .select()
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, 1));
  const pointWeightedPools = resolvePointWeightedPools(settings);

  const { roster } = await loadShiftCalcData(shiftId);
  return roster
    .filter((r) => needsPointDecision(r, pointWeightedPools))
    .map((r) => ({
      rosterEntryId: r.rosterEntryId,
      employeeName: r.employeeName,
      positionName: r.positionName,
    }));
}

/** Human-readable "X (Position), Y (Position)" for the banner and the
 * thrown gate message -- same wording in both places by construction. */
export function describeUndecided(rows: UndecidedPointRow[]): string {
  return rows.map((r) => `${r.employeeName} (${r.positionName})`).join(", ");
}
