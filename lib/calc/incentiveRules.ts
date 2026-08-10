/**
 * Pure evaluator for the generic Incentive Rules engine (2026-08-10).
 * DB-free, framework-free, unit-tested — same pattern as tipPool.ts and
 * finalizeShift.ts. The full schema (db/schema.ts: incentiveRules,
 * incentiveRuleConditions, incentiveRuleTargets, employeeRuleWeights,
 * incentivePayoutRecords) was designed back on 2026-08-08, but evaluation
 * logic was deliberately deferred until a second real bonus scenario
 * needed it (the first, the host drink bonus, was simple enough to
 * hardcode directly in finalizeShift.ts — see that file's header comment).
 *
 * Oliver's 2026-08-10 request is that second scenario: "if total sale hit
 * $10,000 BOH should get $20 flat rate incentive... for test sake, real
 * rule incentive amount should be flexible and each individual BOH staff
 * would probably get different incentive amount." Confirmed via
 * AskUserQuestion to scope this round to flat rate for ALL BOH first (not
 * per-employee weighting) and SHIFT-period only.
 *
 * DELIBERATELY SCOPED OUT this round (same "concrete first" sequencing
 * used throughout this project — see the schema memory's architectural-
 * limitation note): WEEK/MONTH evaluationPeriod, PERCENT_OF_METRIC and
 * ADJUST_TIP_POINT rewardType, WEIGHTED_POOL distributionMethod (which
 * would pull in employeeRuleWeights). A rule using any of those is simply
 * skipped by this evaluator (not an error) until that scenario is
 * actually being built — same "skip what's out of scope, don't guess"
 * approach as elsewhere in this codebase.
 */

export type IncentiveOperator = ">=" | ">" | "<=" | "<" | "between";

export interface IncentiveRuleCondition {
  metricKey: string;
  operator: IncentiveOperator;
  value: number;
  valueTo: number | null; // used when operator = "between"
}

export type IncentiveTargetType = "POSITION" | "EMPLOYEE" | "CATEGORY";

export interface IncentiveRuleTarget {
  targetType: IncentiveTargetType;
  /** positionId, employeeId, or "FOH"/"BOH" — always carried as a string
   * (matches db/schema.ts's targetId column), parsed where needed. */
  targetId: string;
}

export interface IncentiveRuleDef {
  id: number;
  name: string;
  enabled: boolean;
  evaluationPeriod: "SHIFT" | "WEEK" | "MONTH";
  rewardType: "FLAT" | "PERCENT_OF_METRIC" | "ADJUST_TIP_POINT";
  rewardValue: number;
  distributionMethod: "PER_TARGET_FLAT" | "WEIGHTED_POOL";
  conditions: IncentiveRuleCondition[];
  targets: IncentiveRuleTarget[];
}

export interface IncentiveRosterEntry {
  employeeId: number;
  positionId: number;
  category: "FOH" | "BOH";
}

export interface IncentiveRulePayout {
  ruleId: number;
  ruleName: string;
  employeeId: number;
  amount: number;
}

/**
 * Evaluates every rule with evaluationPeriod = "SHIFT" against one shift's
 * metrics + roster. Returns one payout entry per (rule, recipient) pair —
 * an employee eligible for two different rules that both fire gets two
 * separate entries, summed by the caller (see finalizeShift.ts).
 *
 * A rule is skipped (not fired, not an error) if: disabled, not
 * SHIFT-period, uses an out-of-scope rewardType/distributionMethod (see
 * header comment), or has zero conditions (a rule with no conditions
 * would silently fire on every shift forever — treated as unconfigured
 * rather than "always true").
 */
export function evaluateShiftIncentiveRules(
  rules: IncentiveRuleDef[],
  shiftMetrics: Record<string, number>,
  roster: IncentiveRosterEntry[]
): IncentiveRulePayout[] {
  const payouts: IncentiveRulePayout[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.evaluationPeriod !== "SHIFT") continue;
    if (rule.rewardType !== "FLAT") continue;
    if (rule.distributionMethod !== "PER_TARGET_FLAT") continue;
    if (rule.conditions.length === 0) continue;

    const allConditionsMet = rule.conditions.every((c) => evaluateCondition(shiftMetrics[c.metricKey], c));
    if (!allConditionsMet) continue;

    const recipientEmployeeIds = resolveTargets(rule.targets, roster);
    for (const employeeId of recipientEmployeeIds) {
      payouts.push({ ruleId: rule.id, ruleName: rule.name, employeeId, amount: round2(rule.rewardValue) });
    }
  }

  return payouts;
}

function evaluateCondition(actualValue: number | undefined, condition: IncentiveRuleCondition): boolean {
  if (actualValue === undefined) return false; // metric not present this shift -> condition can't be met
  switch (condition.operator) {
    case ">=":
      return actualValue >= condition.value;
    case ">":
      return actualValue > condition.value;
    case "<=":
      return actualValue <= condition.value;
    case "<":
      return actualValue < condition.value;
    case "between":
      return condition.valueTo !== null && actualValue >= condition.value && actualValue <= condition.valueTo;
    default:
      return false;
  }
}

function resolveTargets(targets: IncentiveRuleTarget[], roster: IncentiveRosterEntry[]): number[] {
  const employeeIds = new Set<number>();
  for (const target of targets) {
    if (target.targetType === "CATEGORY") {
      for (const r of roster) {
        if (r.category === target.targetId) employeeIds.add(r.employeeId);
      }
    } else if (target.targetType === "POSITION") {
      const positionId = Number(target.targetId);
      for (const r of roster) {
        if (r.positionId === positionId) employeeIds.add(r.employeeId);
      }
    } else if (target.targetType === "EMPLOYEE") {
      employeeIds.add(Number(target.targetId));
    }
  }
  return Array.from(employeeIds);
}

function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
