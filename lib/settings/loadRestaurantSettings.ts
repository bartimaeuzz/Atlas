import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, restaurantSettings } from "@/db/schema";

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
  /** Default sales-tax rate, stored as a fraction (e.g. 0.08875 for NYC)
   * — used to auto-suggest shiftSales.salesTax / onlinePlatformSalesRecords
   * .taxAmount on the Closing Report; always editable per shift, this is
   * just the starting point. 2026-08-10, sales/tax export feature. The
   * Settings UI itself takes/shows this as a percent (8.875), not a raw
   * fraction — see lib/actions/settings.ts. */
  defaultSalesTaxRate: number;
  /** Staff login method (2026-08-17) — "NAME" = pick-your-name dropdown +
   * PIN (original, default), "ID" = type your YK login ID + PIN. See
   * app/login/page.tsx and db/schema.ts's restaurantSettings comment. */
  staffLoginMethod: "NAME" | "ID";
  /** POS closeout modes (2026-08-31) — how the day-total question at a
   * second-shift close behaves, per source. See db/schema.ts. */
  toastCloseoutMode: "ASK" | "PER_SHIFT" | "CUMULATIVE";
  platformCloseoutMode: "ASK" | "PER_SHIFT" | "CUMULATIVE";
  /** Supplier-check number sequence + door-2 ceiling (2026-08-31
   * lifecycle rebuild — see db/schema.ts). */
  nextCheckNumber: number | null;
  instantCheckCeiling: number;
  /** Two-person money controls (2026-09-01) — see db/schema.ts. */
  requireTwoPersonPayroll: boolean;
  requireTwoPersonCardReconcile: boolean;
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
      defaultSalesTaxRate: 0.08875, // NYC default, matches the schema column default — see db/schema.ts
      staffLoginMethod: "NAME",
      toastCloseoutMode: "ASK",
      platformCloseoutMode: "ASK",
      nextCheckNumber: null,
      instantCheckCeiling: 500,
      requireTwoPersonPayroll: false,
      requireTwoPersonCardReconcile: false,
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
    staffLoginMethod: row.staffLoginMethod as "NAME" | "ID",
    toastCloseoutMode: row.toastCloseoutMode,
    platformCloseoutMode: row.platformCloseoutMode,
    nextCheckNumber: row.nextCheckNumber,
    instantCheckCeiling: row.instantCheckCeiling,
    requireTwoPersonPayroll: row.requireTwoPersonPayroll,
    requireTwoPersonCardReconcile: row.requireTwoPersonCardReconcile,
  };
}

export interface RecoveryCodeStatus {
  /** True once an Admin has generated a code — the Settings page uses
   * this to show "Generate" vs "Regenerate" and to warn that
   * regenerating invalidates the old one. */
  isSet: boolean;
  setAt: string | null;
  lastUsedAt: string | null;
  /** Nickname of whoever's PIN was last reset via the code, for the
   * "was this used without me knowing" visibility check — see
   * db/schema.ts's recoveryCodeLastUsedForEmployeeId comment. Null if
   * never used, or if that employee record is somehow gone. */
  lastUsedForEmployeeNickname: string | null;
}

/** Separate from loadRestaurantSettings/RestaurantSettingsData above —
 * this needs a join to resolve the last-used employee's display name,
 * and is only ever read by the Admin-only "Account recovery" section of
 * Settings, not by every caller of the main settings loader. */
export async function loadRecoveryCodeStatus(): Promise<RecoveryCodeStatus> {
  const [row] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  if (!row) return { isSet: false, setAt: null, lastUsedAt: null, lastUsedForEmployeeNickname: null };

  let lastUsedForEmployeeNickname: string | null = null;
  if (row.recoveryCodeLastUsedForEmployeeId) {
    const [employee] = await db
      .select({ nickname: employees.nickname })
      .from(employees)
      .where(eq(employees.id, row.recoveryCodeLastUsedForEmployeeId));
    lastUsedForEmployeeNickname = employee?.nickname ?? null;
  }

  return {
    isSet: row.recoveryCodeHash !== null,
    setAt: row.recoveryCodeSetAt,
    lastUsedAt: row.recoveryCodeLastUsedAt,
    lastUsedForEmployeeNickname,
  };
}
