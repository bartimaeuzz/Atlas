"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings, incentiveRules, incentiveRuleConditions, incentiveRuleTargets } from "@/db/schema";
import { OFF_PREMISE_METRIC_KEY } from "@/lib/settings/packerBonus";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { logActivity } from "@/lib/activityLog/log";

export interface SettingsActionState {
  error: string | null;
  saved: boolean;
}

/** 2026-08-21 (Phase A) — server-action auth audit: this file had NO auth
 * check at all. Started as a MANAGER/ADMIN gate matching the existing
 * /settings page guard, with EDIT_SETTINGS's tighter Admin-only default
 * explicitly deferred to Phase B.
 *
 * 2026-08-21 (Phase B) — now wired to the real EDIT_SETTINGS capability,
 * matching the confirmed Permission System registry ("Edit Settings
 * (non-financial) — Admin ✓ only"). Verified via a live read-only query
 * before shipping: Aey's real account (Partner) does NOT have
 * EDIT_SETTINGS granted, matching this intended restriction, so this is
 * a live behavior change only for non-Admin managers who were relying on
 * the old MANAGER-tier gate — see project_atlas_permission_system memory
 * for the full reasoning. */

export async function updateRestaurantSettings(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    await requireCapability("EDIT_SETTINGS");
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

    // Staff login method (2026-08-17, Oliver: wants both the name-dropdown
    // AND the YK login-ID field available, switchable — "here is test seed
    // anyway I need easy way to login on each profile"). See
    // db/schema.ts's restaurantSettings.staffLoginMethod comment.
    const staffLoginMethodRaw = String(formData.get("staffLoginMethod") ?? "NAME");
    if (staffLoginMethodRaw !== "NAME" && staffLoginMethodRaw !== "ID") {
      throw new Error("Invalid staff login method");
    }
    const staffLoginMethod = staffLoginMethodRaw as "NAME" | "ID";

    // POS closeout modes (2026-08-31) — see db/schema.ts. Validated
    // against the enum; anything else is a tampered post, refused.
    const closeoutMode = (name: string): "ASK" | "PER_SHIFT" | "CUMULATIVE" => {
      const v = String(formData.get(name) ?? "ASK");
      if (v !== "ASK" && v !== "PER_SHIFT" && v !== "CUMULATIVE") throw new Error("Invalid closeout mode");
      return v;
    };
    const toastCloseoutMode = closeoutMode("toastCloseoutMode");
    const platformCloseoutMode = closeoutMode("platformCloseoutMode");

    /* Supplier-check money controls (2026-08-31 lifecycle rebuild).
     * Both gate real dollars, so a CHANGE to either is written to the
     * activity log with before/after — the ceiling means nothing if it
     * can move silently. */
    const [currentSettings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
    const session = await (await import("@/lib/auth/session")).getCurrentStaffSession();

    const nextCheckNumberRaw = String(formData.get("nextCheckNumber") ?? "").trim();
    const nextCheckNumber = nextCheckNumberRaw === "" ? null : Number(nextCheckNumberRaw);
    if (nextCheckNumber !== null && (!Number.isInteger(nextCheckNumber) || nextCheckNumber < 1)) {
      throw new Error("Next check number must be a whole number (the next unused number in the physical checkbook).");
    }
    const instantCheckCeiling = Number(formData.get("instantCheckCeiling") ?? 500);
    if (Number.isNaN(instantCheckCeiling) || instantCheckCeiling < 0) {
      throw new Error("Instant-check ceiling must be a non-negative amount.");
    }

    if (session && currentSettings && currentSettings.nextCheckNumber !== nextCheckNumber) {
      await logActivity({
        actorEmployeeId: session.id,
        type: "settings.check_sequence_changed",
        entityType: "restaurant_settings",
        entityId: "1",
        summary: `Check number sequence changed: ${currentSettings.nextCheckNumber ?? "not set"} → ${nextCheckNumber ?? "not set"}.`,
        detail: { before: currentSettings.nextCheckNumber, after: nextCheckNumber },
      });
    }
    if (session && currentSettings && currentSettings.instantCheckCeiling !== instantCheckCeiling) {
      await logActivity({
        actorEmployeeId: session.id,
        type: "settings.instant_ceiling_changed",
        entityType: "restaurant_settings",
        entityId: "1",
        summary: `Instant-check ceiling changed: $${currentSettings.instantCheckCeiling.toFixed(2)} → $${instantCheckCeiling.toFixed(2)}.`,
        detail: { before: currentSettings.instantCheckCeiling, after: instantCheckCeiling },
      });
    }

    /* Packer off-premise bonus (2026-08-31) — upserts the generic
     * incentive rule keyed by poolSourceMetricKey, see
     * lib/settings/packerBonus.ts for the full business rule. The rate
     * field is read in DISPLAY units (percent number, or $ per $100)
     * and converted for storage here, same pattern as the tax percent
     * fields above. */
    const packerStyleRaw = String(formData.get("packerBonusStyle") ?? "PERCENT");
    if (packerStyleRaw !== "PERCENT" && packerStyleRaw !== "PER_BLOCK") throw new Error("Invalid packer bonus style");
    const packerEnabled = formData.get("packerBonusEnabled") === "on";
    const packerRate = Number(formData.get("packerBonusRate") ?? 0);
    if (Number.isNaN(packerRate) || packerRate < 0) throw new Error("Packer bonus rate must be a non-negative number");
    if (packerStyleRaw === "PERCENT" && packerRate > 100) throw new Error("Packer bonus percent must be between 0 and 100");
    const packerPositionIdRaw = formData.get("packerBonusPositionId");
    const packerPositionId =
      packerPositionIdRaw && String(packerPositionIdRaw).trim() !== "" ? Number(packerPositionIdRaw) : null;
    if (packerEnabled && !packerPositionId) {
      throw new Error("Pick which position earns the packer bonus before turning it on.");
    }

    const [existingRule] = await db
      .select()
      .from(incentiveRules)
      .where(eq(incentiveRules.poolSourceMetricKey, OFF_PREMISE_METRIC_KEY));

    const ruleValues = {
      name: "Packer off-premise bonus",
      description:
        "House-paid share of all off-premise sales (Toast takeout + Toast delivery + online platforms, pre-tax), split equally among whoever worked the packer position that shift. Never taken from a tip pool.",
      enabled: packerEnabled,
      evaluationPeriod: "SHIFT" as const,
      rewardType: (packerStyleRaw === "PER_BLOCK" ? "PER_BLOCK_OF_METRIC" : "PERCENT_OF_METRIC") as
        | "PER_BLOCK_OF_METRIC"
        | "PERCENT_OF_METRIC",
      rewardValue: packerStyleRaw === "PER_BLOCK" ? packerRate : packerRate / 100,
      rewardCap: null,
      distributionMethod: "WEIGHTED_POOL" as const,
      weightSource: null,
      weightMetricKey: null,
      poolSourceMetricKey: OFF_PREMISE_METRIC_KEY,
    };

    if (existingRule) {
      await db.update(incentiveRules).set(ruleValues).where(eq(incentiveRules.id, existingRule.id));
      // Replace the position target wholesale — one rule, one target.
      await db.delete(incentiveRuleTargets).where(eq(incentiveRuleTargets.ruleId, existingRule.id));
      if (packerPositionId) {
        await db
          .insert(incentiveRuleTargets)
          .values({ ruleId: existingRule.id, targetType: "POSITION", targetId: String(packerPositionId) });
      }
    } else if (packerEnabled || packerPositionId) {
      // Create only once someone actually configures it — a restaurant
      // that never touches this section gets no phantom rule row.
      const [rule] = await db.insert(incentiveRules).values(ruleValues).returning();
      await db.insert(incentiveRuleConditions).values({
        ruleId: rule.id,
        metricKey: OFF_PREMISE_METRIC_KEY,
        operator: ">",
        value: 0,
        valueTo: null,
      });
      if (packerPositionId) {
        await db
          .insert(incentiveRuleTargets)
          .values({ ruleId: rule.id, targetType: "POSITION", targetId: String(packerPositionId) });
      }
    }

    await db
      .update(restaurantSettings)
      .set({
        toastCloseoutMode,
        platformCloseoutMode,
        nextCheckNumber,
        instantCheckCeiling,
        ccTipDeductionRate,
        hostDrinkBonusPerDrinkAmount,
        defaultSalesTaxRate,
        staffLoginMethod,
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
