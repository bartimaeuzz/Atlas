import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings } from "@/db/schema";

export type PoolSplitMethod = "POINT_WEIGHTED" | "EQUAL_SPLIT";

export interface RestaurantSettingsData {
  ccTipDeductionRate: number;
  /** Split 2026-08-10 from one combined "peer earnings" toggle into
   * independent Tip and Wage visibility, still at FOH/BOH category
   * granularity — see db/schema.ts's restaurantSettings comment for the
   * full rationale. */
  rosterShowPeerTipFOH: boolean;
  rosterShowPeerTipBOH: boolean;
  rosterShowPeerWageFOH: boolean;
  rosterShowPeerWageBOH: boolean;
  rosterRestrictFOHToOwnCategory: boolean;
  rosterRestrictBOHToOwnCategory: boolean;
  rosterShowCoworkerListFOH: boolean;
  rosterShowCoworkerListBOH: boolean;
  pool1SplitMethod: PoolSplitMethod;
  pool2SplitMethod: PoolSplitMethod;
  pool3SplitMethod: PoolSplitMethod;
  hostDrinkBonusPerDrinkAmount: number;
  /** Default sales-tax rate (e.g. 0.08875 for NYC) used to auto-suggest
   * shiftSales.salesTax / onlinePlatformSalesRecords.taxAmount on the
   * Closing Report — always editable per shift, this is just the starting
   * point. 2026-08-10, sales/tax export feature. */
  defaultSalesTaxRate: number;
}

/** Single-row settings table (restaurantId=1 reserved for future
 * multi-tenant use, same as everywhere else this table is touched). Every
 * field here previously had zero UI — set once at seed time and otherwise
 * unreachable without editing db/seed.ts directly, same class of gap
 * Position admin closed for positions. This loader/page closes it for the
 * rest of restaurantSettings in one pass rather than adding a page per
 * setting as each one's UI need comes up individually. */
export async function loadRestaurantSettings(): Promise<RestaurantSettingsData> {
  const [row] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  if (!row) {
    // Should never happen post-seed, but fall back to schema defaults
    // rather than crashing the settings page if it somehow does.
    return {
      ccTipDeductionRate: 0,
      rosterShowPeerTipFOH: true,
      rosterShowPeerTipBOH: false,
      rosterShowPeerWageFOH: true,
      rosterShowPeerWageBOH: false,
      rosterRestrictFOHToOwnCategory: true,
      rosterRestrictBOHToOwnCategory: true,
      rosterShowCoworkerListFOH: true,
      rosterShowCoworkerListBOH: true,
      pool1SplitMethod: "POINT_WEIGHTED",
      pool2SplitMethod: "POINT_WEIGHTED",
      pool3SplitMethod: "EQUAL_SPLIT",
      hostDrinkBonusPerDrinkAmount: 0,
      defaultSalesTaxRate: 0,
    };
  }
  return {
    ccTipDeductionRate: row.ccTipDeductionRate,
    rosterShowPeerTipFOH: row.rosterShowPeerTipFOH,
    rosterShowPeerTipBOH: row.rosterShowPeerTipBOH,
    rosterShowPeerWageFOH: row.rosterShowPeerWageFOH,
    rosterShowPeerWageBOH: row.rosterShowPeerWageBOH,
    rosterRestrictFOHToOwnCategory: row.rosterRestrictFOHToOwnCategory,
    rosterRestrictBOHToOwnCategory: row.rosterRestrictBOHToOwnCategory,
    rosterShowCoworkerListFOH: row.rosterShowCoworkerListFOH,
    rosterShowCoworkerListBOH: row.rosterShowCoworkerListBOH,
    pool1SplitMethod: row.pool1SplitMethod as PoolSplitMethod,
    pool2SplitMethod: row.pool2SplitMethod as PoolSplitMethod,
    pool3SplitMethod: row.pool3SplitMethod as PoolSplitMethod,
    hostDrinkBonusPerDrinkAmount: row.hostDrinkBonusPerDrinkAmount,
    defaultSalesTaxRate: row.defaultSalesTaxRate,
  };
}
