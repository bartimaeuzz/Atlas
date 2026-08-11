"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings } from "@/db/schema";

export interface SettingsActionState {
  error: string | null;
  saved: boolean;
}

const POOL_METHODS = ["POINT_WEIGHTED", "EQUAL_SPLIT"] as const;

export async function updateRestaurantSettings(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const ccTipDeductionRate = Number(formData.get("ccTipDeductionRate") ?? 0);
    if (Number.isNaN(ccTipDeductionRate) || ccTipDeductionRate < 0 || ccTipDeductionRate > 1) {
      throw new Error("CC tip deduction rate must be a number between 0 and 1 (e.g. 0.045 for 4.5%)");
    }

    const hostDrinkBonusPerDrinkAmount = Number(formData.get("hostDrinkBonusPerDrinkAmount") ?? 0);
    if (Number.isNaN(hostDrinkBonusPerDrinkAmount) || hostDrinkBonusPerDrinkAmount < 0) {
      throw new Error("Host drink bonus rate must be a non-negative number");
    }

    const defaultSalesTaxRate = Number(formData.get("defaultSalesTaxRate") ?? 0);
    if (Number.isNaN(defaultSalesTaxRate) || defaultSalesTaxRate < 0 || defaultSalesTaxRate > 1) {
      throw new Error("Default sales tax rate must be a number between 0 and 1 (e.g. 0.08875 for 8.875%)");
    }

    const poolMethod = (name: string) => {
      const v = String(formData.get(name) ?? "");
      if (!POOL_METHODS.includes(v as (typeof POOL_METHODS)[number])) {
        throw new Error(`Invalid split method for ${name}`);
      }
      return v as (typeof POOL_METHODS)[number];
    };

    const flag = (name: string) => formData.get(name) === "on";

    await db
      .update(restaurantSettings)
      .set({
        ccTipDeductionRate,
        hostDrinkBonusPerDrinkAmount,
        defaultSalesTaxRate,
        pool1SplitMethod: poolMethod("pool1SplitMethod"),
        pool2SplitMethod: poolMethod("pool2SplitMethod"),
        pool3SplitMethod: poolMethod("pool3SplitMethod"),
        rosterShowPeerTipFOH: flag("rosterShowPeerTipFOH"),
        rosterShowPeerTipBOH: flag("rosterShowPeerTipBOH"),
        rosterShowPeerWageFOH: flag("rosterShowPeerWageFOH"),
        rosterShowPeerWageBOH: flag("rosterShowPeerWageBOH"),
        rosterRestrictFOHToOwnCategory: flag("rosterRestrictFOHToOwnCategory"),
        rosterRestrictBOHToOwnCategory: flag("rosterRestrictBOHToOwnCategory"),
        rosterShowCoworkerListFOH: flag("rosterShowCoworkerListFOH"),
        rosterShowCoworkerListBOH: flag("rosterShowCoworkerListBOH"),
      })
      .where(eq(restaurantSettings.restaurantId, 1));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), saved: false };
  }

  revalidatePath("/settings");
  return { error: null, saved: true };
}
