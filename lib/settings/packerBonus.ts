import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { incentiveRules, incentiveRuleTargets } from "@/db/schema";

/** The packer off-premise bonus's settings-facing shape (2026-08-31,
 * Aey's run-through; every number confirmed with Oliver one at a time):
 * a share of ALL off-premise sales — Toast takeout + Toast phone/own
 * delivery + every online platform, pre-tax ("any channel the packer
 * has to pack") — paid BY THE HOUSE, never out of any tip pool
 * ("ถ้าเอาทิปไปจ่าย ก็คือโกงพนักงาน"), split equally among however many
 * packers worked the shift (หารกัน — the house pays the pool once).
 *
 * Stored as a generic incentiveRules row rather than bespoke settings
 * columns, keyed by poolSourceMetricKey = "off_premise_sales" — the rule
 * engine already evaluates it at finalize (lib/calc/incentiveRules.ts),
 * the payout lands in the existing Incentive column, and a future
 * restaurant can retune it without a schema change. Style:
 *   PERCENT  -> rewardType PERCENT_OF_METRIC, rewardValue = fraction
 *   PER_BLOCK -> rewardType PER_BLOCK_OF_METRIC, rewardValue = $ per
 *                full $100 (floored: $199 pays $1)
 * The "which position is the packer" choice is the rule's POSITION
 * target — picked in Settings, never a hardcoded name. */

export const OFF_PREMISE_METRIC_KEY = "off_premise_sales";

export interface PackerBonusConfig {
  configured: boolean;
  enabled: boolean;
  style: "PERCENT" | "PER_BLOCK";
  /** Display value: percent number for PERCENT (1 = 1%), $ per $100 for
   * PER_BLOCK. Conversion to the stored rewardValue happens in the
   * settings action. */
  rate: number;
  positionId: number | null;
}

export async function loadPackerBonusConfig(): Promise<PackerBonusConfig> {
  const [rule] = await db
    .select()
    .from(incentiveRules)
    .where(eq(incentiveRules.poolSourceMetricKey, OFF_PREMISE_METRIC_KEY));
  if (!rule) {
    return { configured: false, enabled: false, style: "PERCENT", rate: 1, positionId: null };
  }
  const targets = await db.select().from(incentiveRuleTargets).where(eq(incentiveRuleTargets.ruleId, rule.id));
  const positionTarget = targets.find((t) => t.targetType === "POSITION");
  return {
    configured: true,
    enabled: rule.enabled,
    style: rule.rewardType === "PER_BLOCK_OF_METRIC" ? "PER_BLOCK" : "PERCENT",
    rate: rule.rewardType === "PER_BLOCK_OF_METRIC" ? rule.rewardValue : rule.rewardValue * 100,
    positionId: positionTarget ? Number(positionTarget.targetId) : null,
  };
}
