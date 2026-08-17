"use server";

/** Tip Pool Assignment settings section (2026-08-17) — moved OFF the main
 * Settings page into its own page (/settings/tip-pools), alongside a new
 * visual position<->pool assignment UI (arrows + drag-and-drop, confirmed
 * with Oliver as a second way to edit the SAME `positionTipPools` data the
 * Positions page's per-position checkboxes already write — not a fork).
 * Both actions here save immediately on click/change, no separate "Save"
 * step, matching the toggle-style interaction the new page is built
 * around (same immediate-action pattern as togglePositionActive /
 * toggleLedgerCardActive elsewhere in this app). */

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings, positionTipPools } from "@/db/schema";

export type TipPoolGroup = "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY";
export type PoolSplitMethod = "POINT_WEIGHTED" | "EQUAL_SPLIT";

/** Adds or removes exactly one (position, pool) membership row — the
 * arrow-button / drag-and-drop target on /settings/tip-pools. Mirrors
 * lib/actions/positions.ts's syncPositionChildRows but touches a single
 * row instead of replacing a position's whole set, since this page's
 * interaction model is "toggle one pool at a time," not "submit a whole
 * form." Writes the same positionTipPools table the Positions edit
 * page's checkboxes use — both stay in sync automatically since there's
 * only ever one underlying table. */
export async function toggleTipPoolMembership(positionId: number, tipPoolGroup: TipPoolGroup, add: boolean) {
  if (add) {
    const [existing] = await db
      .select()
      .from(positionTipPools)
      .where(and(eq(positionTipPools.positionId, positionId), eq(positionTipPools.tipPoolGroup, tipPoolGroup)));
    if (!existing) {
      await db.insert(positionTipPools).values({ positionId, tipPoolGroup });
    }
  } else {
    await db
      .delete(positionTipPools)
      .where(and(eq(positionTipPools.positionId, positionId), eq(positionTipPools.tipPoolGroup, tipPoolGroup)));
  }
  revalidatePath("/settings/tip-pools");
  revalidatePath("/positions");
}

/** Updates one pool's split method (point-weighted vs. equal split) —
 * the only place this now lives (moved off the main Settings page, see
 * this file's header comment). */
export async function updatePoolSplitMethod(tipPoolGroup: TipPoolGroup, method: PoolSplitMethod) {
  switch (tipPoolGroup) {
    case "POOL_1_DINE_IN":
      await db.update(restaurantSettings).set({ pool1SplitMethod: method }).where(eq(restaurantSettings.restaurantId, 1));
      break;
    case "POOL_2_TAKEOUT_ONLINE":
      await db.update(restaurantSettings).set({ pool2SplitMethod: method }).where(eq(restaurantSettings.restaurantId, 1));
      break;
    case "POOL_3_DELIVERY":
      await db.update(restaurantSettings).set({ pool3SplitMethod: method }).where(eq(restaurantSettings.restaurantId, 1));
      break;
  }
  revalidatePath("/settings/tip-pools");
}
