"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings } from "@/db/schema";

export interface SettingsActionState {
  error: string | null;
  saved: boolean;
}

export async function updateRestaurantSettings(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    // Entered as a percent (e.g. 4.5 for 4.5%), same fix as the sales tax
    // rate below (2026-08-15 accessibility audit flag #1, applied here
    // 2026-08-17) — typing the raw fraction (0.045) invited the same
    // silent-mistake risk. Converted to a fraction here for storage so
    // every downstream consumer (tip pool calc) is unaffected.
    const ccTipDeductionRatePercent = Number(formData.get("ccTipDeductionRatePercent") ?? 0);
    if (Number.isNaN(ccTipDeductionRatePercent) || ccTipDeductionRatePercent < 0 || ccTipDeductionRatePercent > 100) {
      throw new Error("CC tip deduction rate must be a percent between 0 and 100 (e.g. 4.5 for 4.5%)");
    }
    const ccTipDeductionRate = ccTipDeductionRatePercent / 100;

    const hostDrinkBonusPerDrinkAmount = Number(formData.get("hostDrinkBonusPerDrinkAmount") ?? 0);
    if (Number.isNaN(hostDrinkBonusPerDrinkAmount) || hostDrinkBonusPerDrinkAmount < 0) {
      throw new Error("Host drink bonus rate must be a non-negative number");
    }

    // Entered as a percent (e.g. 8.875 for NYC) since that's how a manager
    // naturally thinks about a tax rate — typing the raw fraction (0.08875)
    // was flagged as a real error risk (2026-08-15 accessibility audit,
    // flag #1: easy to type "8.875" by mistake and silently 8x every
    // computed tax figure). Converted to a fraction here for storage so
    // every downstream consumer (Closing Report auto-fill, reports) is
    // unaffected.
    const defaultSalesTaxRatePercent = Number(formData.get("defaultSalesTaxRatePercent") ?? 0);
    if (Number.isNaN(defaultSalesTaxRatePercent) || defaultSalesTaxRatePercent < 0 || defaultSalesTaxRatePercent > 100) {
      throw new Error("Default sales tax rate must be a percent between 0 and 100 (e.g. 8.875 for NYC's 8.875%)");
    }
    const defaultSalesTaxRate = defaultSalesTaxRatePercent / 100;

    const flag = (name: string) => formData.get(name) === "on";

    await db
      .update(restaurantSettings)
      .set({
        ccTipDeductionRate,
        hostDrinkBonusPerDrinkAmount,
        defaultSalesTaxRate,
        // pool1/2/3SplitMethod moved to /settings/tip-pools (2026-08-17) —
        // that page's split-method dropdowns save immediately via
        // lib/actions/tipPools.ts's updatePoolSplitMethod, not through
        // this whole-form submit, so they're deliberately absent here now.
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
