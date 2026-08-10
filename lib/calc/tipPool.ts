/**
 * Core tip-pool calculation — THREE separate pools (confirmed 2026-08-08),
 * FUNDING is fixed per pool, but the SPLIT METHOD (point-weighted vs. equal)
 * for each pool is a per-restaurant setting, not a hardcoded rule (added
 * 2026-08-08 after Oliver raised the fairness question — some restaurants
 * want skill/seniority reflected in pay, others want pools to reinforce
 * "everyone gets the same" and avoid friction over point judgment calls):
 *
 *   Pool 1 (dine-in) — Server, Runner, Bartender, Host, Busser share CC tips
 *   from guests eating in the restaurant. Youk Thai defaults this to
 *   POINT-WEIGHTED. The host TEAM's cocktail/mocktail upsell bonus ($X per
 *   qualifying drink, ONE shared count for the whole shift, not per host —
 *   corrected 2026-08-10 after Oliver clarified it's a pooled waiting-area
 *   drink count, not individually self-reported) is pulled off the top of
 *   Pool 1 before the split, then divided EQUALLY among whoever worked Host
 *   that shift — on top of their normal Pool 1 share (which can ALSO be
 *   bumped by up to the rule's cap, e.g. +0.2 points, when Pool 1 is
 *   point-weighted). These are two additive components, not alternatives.
 *
 *   Pool 2 (takeout + platform-courier) — Host, Operator, Packer, Bag
 *   Handler share this. Youk Thai defaults this to POINT-WEIGHTED. Funded
 *   by: takeout tips paid at the restaurant's own register (4.5% deducted —
 *   manually-identified subset of the day's total CC tip, same pattern as
 *   host-upsell identification) PLUS online-platform tips for orders where
 *   the PLATFORM'S OWN COURIER did the delivery (not deducted — restaurant
 *   staff only packed/handed off).
 *
 *   Pool 3 (delivery) — Delivery Guy only. Youk Thai defaults this to
 *   EQUAL_SPLIT (their reasoning: delivery work doesn't vary by skill the
 *   way serving does) — but like the other two pools, this is now a
 *   restaurant setting, not a hardcoded rule. Funded by: Toast-based
 *   delivery tips, i.e. phone orders or the restaurant's own future platform
 *   (4.5% deducted) PLUS online-platform tips where the RESTAURANT'S OWN
 *   driver did the delivery (not deducted). Cash tips handed directly to a
 *   driver are NOT pooled at all — paid 100% to that individual, tracked
 *   separately for reporting.
 *
 *   Host is a member of BOTH Pool 1 and Pool 2. Routing an online-platform
 *   tip to Pool 2 vs Pool 3 depends entirely on who delivered that order —
 *   this needs to be captured per platform-sales record, not assumed.
 *
 * Manager / Floor Manager are in NO pool — commission-only, handled entirely
 * by the generic incentive rules engine, not this file.
 *
 * NOTE: the pool COUNT and FUNDING FORMULAS above are still hardcoded, not
 * restaurant-configurable — confirmed as a known, deliberately deferred
 * limitation (see "CONFIRMED ARCHITECTURAL LIMITATION" in project memory).
 * Only the split method within each of these three fixed pools is a setting.
 */

/** Confirmed 2026-08-08: whether a pool splits by point value or splits
 * equally is itself a per-restaurant, per-pool CHOICE (RestaurantSettings.
 * pool1SplitMethod / pool2SplitMethod / pool3SplitMethod), not a fixed rule
 * — Youk Thai defaults to point-weighted for Pool 1/2 and equal for Pool 3,
 * matching this file's behavior before this setting existed, but another
 * restaurant could configure any pool either way. */
export type PoolSplitMethod = "POINT_WEIGHTED" | "EQUAL_SPLIT";

export interface PoolRosterEntry {
  employeeId: number;
  pointValue: number;
}

/** ONE shared count for the whole host team's waiting-area drink sales that
 * shift (not a per-host self-reported number — corrected 2026-08-10). The
 * resulting dollar bonus (qualifyingDrinkCount x perDrinkAmount) is pulled
 * off Pool 1's top, then split EQUALLY across recipientEmployeeIds
 * (whoever worked Host that shift) — never point-weighted, regardless of
 * Pool 1's own split method setting. null/omitted recipientEmployeeIds or
 * qualifyingDrinkCount of 0 means no bonus this shift. */
export interface HostDrinkBonusInput {
  qualifyingDrinkCount: number;
  perDrinkAmount: number; // e.g. 1.00
  recipientEmployeeIds: number[]; // whoever worked Host this shift, splits equally
}

export interface TwoPoolTipCalcInput {
  deductionRate: number; // e.g. 0.045

  // Pool 1 inputs
  grossCcTip: number; // Toast total CC tip — includes dine-in, takeout, AND phone/own-platform delivery
  takeoutCcTip: number; // manually-identified subset of grossCcTip from takeout orders (register pickup)
  hostDrinkBonus: HostDrinkBonusInput | null;
  pool1Roster: PoolRosterEntry[]; // Server/Runner/Bartender/Host/Busser on shift, with this shift's point value
  pool1SplitMethod: PoolSplitMethod;

  // Pool 2 inputs
  platformCourierTips: number; // online-platform tips where the PLATFORM'S courier delivered (not deducted)
  pool2Roster: PoolRosterEntry[]; // Host/Operator/Packer/Bag Handler on shift
  pool2SplitMethod: PoolSplitMethod;

  // Pool 3 inputs
  deliveryToastTip: number; // manually-identified subset of grossCcTip from phone/own-platform delivery orders (gets deducted)
  platformDeliveryTips: number; // online-platform tips where the RESTAURANT'S OWN driver delivered (not deducted)
  pool3Roster: PoolRosterEntry[]; // Delivery Guy on shift, with point value (only matters if pool3SplitMethod = POINT_WEIGHTED)
  pool3SplitMethod: PoolSplitMethod; // Youk Thai's default is EQUAL_SPLIT, but this is now a choice, not a rule
}

export interface TwoPoolTipCalcResult {
  pool1: {
    grossDineInCcTip: number;
    netDineInCcTip: number;
    totalHostDrinkBonus: number;
    netPool1AfterHostBonus: number;
    shareByEmployee: Record<number, number>;
  };
  hostDrinkBonusByEmployee: Record<number, number>;
  pool2: {
    netTakeoutCcTip: number;
    platformCourierTips: number;
    totalPool2: number;
    shareByEmployee: Record<number, number>;
  };
  pool3: {
    netDeliveryToastTip: number;
    platformDeliveryTips: number;
    totalPool3: number;
    shareByEmployee: Record<number, number>; // equal split, still keyed by employeeId
  };
}

export function calculateTwoPoolTips(input: TwoPoolTipCalcInput): TwoPoolTipCalcResult {
  const {
    deductionRate, grossCcTip, takeoutCcTip, hostDrinkBonus, pool1Roster, pool1SplitMethod,
    platformCourierTips, pool2Roster, pool2SplitMethod,
    deliveryToastTip, platformDeliveryTips, pool3Roster, pool3SplitMethod,
  } = input;

  if (deductionRate < 0 || deductionRate > 1) {
    throw new Error(
      `Deduction rate should be between 0 and 1 (e.g. 0.045 for 4.5%) — got ${deductionRate}. Check Restaurant Settings.`
    );
  }
  if (grossCcTip < 0) throw new Error(`Gross CC tip can't be negative — got ${grossCcTip}. Check the Total CC Tip field.`);
  if (takeoutCcTip < 0) throw new Error(`Takeout CC tip can't be negative — got ${takeoutCcTip}.`);
  if (deliveryToastTip < 0) throw new Error(`Delivery Toast tip can't be negative — got ${deliveryToastTip}.`);
  if (takeoutCcTip + deliveryToastTip > grossCcTip) {
    throw new Error(
      `Takeout tip ($${takeoutCcTip}) plus delivery tip ($${deliveryToastTip}) adds up to more than the Total CC Tip ` +
      `you entered ($${grossCcTip}). Total CC Tip should be the restaurant's FULL day's card tip total — takeout and ` +
      `delivery tips are a SUBSET of it, not added on top. Most likely fix: make sure you filled in Total CC Tip ` +
      `(it's easy to enter Takeout/Delivery first and forget it).`
    );
  }

  // ---- Pool 1: dine-in ----
  const grossDineInCcTip = round2(grossCcTip - takeoutCcTip - deliveryToastTip);
  const netDineInCcTip = round2(grossDineInCcTip * (1 - deductionRate));

  const totalHostDrinkBonus =
    hostDrinkBonus && hostDrinkBonus.recipientEmployeeIds.length > 0
      ? round2(hostDrinkBonus.qualifyingDrinkCount * hostDrinkBonus.perDrinkAmount)
      : 0;
  // Equal split among the host team, regardless of Pool 1's own split
  // method — this bonus is explicitly NOT point-weighted (confirmed
  // 2026-08-10), unlike the normal Pool 1 share these same people also get.
  const hostDrinkBonusByEmployee: Record<number, number> =
    totalHostDrinkBonus > 0 && hostDrinkBonus
      ? splitByPointsExact(
          totalHostDrinkBonus,
          hostDrinkBonus.recipientEmployeeIds.map((employeeId) => ({ employeeId, pointValue: 1.0 }))
        )
      : {};

  const netPool1AfterHostBonus = round2(netDineInCcTip - totalHostDrinkBonus);
  if (netPool1AfterHostBonus < 0) {
    throw new Error(
      `The host drink bonus ($${totalHostDrinkBonus}) is more than this shift's dine-in tip pool ($${netDineInCcTip} ` +
      `after deduction). Check the qualifying drink count and $-per-drink amount before saving.`
    );
  }

  const pool1ShareByEmployee = splitByMethod(netPool1AfterHostBonus, pool1Roster, pool1SplitMethod);

  // ---- Pool 2: takeout (register) + platform-courier-delivered online orders ----
  const netTakeoutCcTip = round2(takeoutCcTip * (1 - deductionRate));
  const totalPool2 = round2(netTakeoutCcTip + platformCourierTips);
  const pool2ShareByEmployee = splitByMethod(totalPool2, pool2Roster, pool2SplitMethod);

  // ---- Pool 3: delivery (Toast phone/own-platform orders + restaurant-driver-delivered online orders) ----
  const netDeliveryToastTip = round2(deliveryToastTip * (1 - deductionRate));
  const totalPool3 = round2(netDeliveryToastTip + platformDeliveryTips);
  const pool3ShareByEmployee = splitByMethod(totalPool3, pool3Roster, pool3SplitMethod);

  return {
    pool1: {
      grossDineInCcTip,
      netDineInCcTip,
      totalHostDrinkBonus,
      netPool1AfterHostBonus,
      shareByEmployee: pool1ShareByEmployee,
    },
    hostDrinkBonusByEmployee,
    pool2: {
      netTakeoutCcTip,
      platformCourierTips: round2(platformCourierTips),
      totalPool2,
      shareByEmployee: pool2ShareByEmployee,
    },
    pool3: {
      netDeliveryToastTip,
      platformDeliveryTips: round2(platformDeliveryTips),
      totalPool3,
      shareByEmployee: pool3ShareByEmployee,
    },
  };
}

/** Dispatches to the pool's configured split method. EQUAL_SPLIT is
 * implemented as splitByPointsExact with every point value forced to 1.0,
 * so both methods reuse the same exact-cent reconciliation logic (largest-
 * remainder) rather than duplicating rounding behavior. */
function splitByMethod(
  poolAmount: number,
  roster: PoolRosterEntry[],
  method: PoolSplitMethod
): Record<number, number> {
  if (method === "EQUAL_SPLIT") {
    return splitByPointsExact(
      poolAmount,
      roster.map((r) => ({ employeeId: r.employeeId, pointValue: 1.0 }))
    );
  }
  return splitByPointsExact(poolAmount, roster);
}

/** Splits `poolAmount` across roster entries proportional to point value,
 * using the largest-remainder method so the cent-rounded shares always sum
 * back to exactly poolAmount — no cent ever leaks or gets duplicated. */
export function splitByPointsExact(
  poolAmount: number,
  roster: PoolRosterEntry[]
): Record<number, number> {
  const result: Record<number, number> = {};
  const totalPoints = sum(roster.map((r) => r.pointValue));
  if (totalPoints <= 0 || roster.length === 0) return result;

  const targetCents = Math.round(poolAmount * 100);

  const rows = roster.map((r) => {
    const rawCents = (poolAmount * 100 * r.pointValue) / totalPoints;
    const flooredCents = Math.floor(rawCents);
    return { employeeId: r.employeeId, flooredCents, remainder: rawCents - flooredCents };
  });

  let allocatedCents = sum(rows.map((r) => r.flooredCents));
  let leftoverCents = targetCents - allocatedCents;

  const byRemainderDesc = [...rows].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < byRemainderDesc.length && leftoverCents > 0; i++, leftoverCents--) {
    byRemainderDesc[i].flooredCents += 1;
  }

  for (const r of rows) {
    result[r.employeeId] = round2((result[r.employeeId] ?? 0) + r.flooredCents / 100);
  }

  return result;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

// A plain Math.round(n * 100) / 100 is NOT safe for money: floating point
// representation error (e.g. 0.955 stored as a double is a hair below its
// true value) can push an exact .xx5 boundary to the wrong side — 585 *
// 0.955 should round to 558.68 but plain rounding gave 558.67. Caught by a
// unit test, not a hunch — worth keeping this comment so nobody "simplifies"
// it back to a floating point bug in a payroll calculation.
export function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
