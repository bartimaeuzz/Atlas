/**
 * Core tip-pool calculation — THREE separate pools (confirmed 2026-08-08):
 *
 *   Pool 1 (dine-in) — Server, Runner, Bartender, Host, Busser share CC tips
 *   from guests eating in the restaurant, POINT-WEIGHTED. The host's
 *   cocktail/mocktail upsell bonus ($X per qualifying drink) is pulled off
 *   the top of Pool 1 before the point-weighted split, and paid entirely to
 *   that host — on top of their normal point-weighted Pool 1 share (which
 *   can ALSO be bumped by up to the rule's cap, e.g. +0.2 points). These are
 *   two additive components, not alternatives.
 *
 *   Pool 2 (takeout + platform-courier) — Host, Operator, Packer, Bag
 *   Handler share this, POINT-WEIGHTED. Funded by: takeout tips paid at the
 *   restaurant's own register (4.5% deducted — manually-identified subset of
 *   the day's total CC tip, same pattern as host-upsell identification) PLUS
 *   online-platform tips for orders where the PLATFORM'S OWN COURIER did the
 *   delivery (not deducted — restaurant staff only packed/handed off).
 *
 *   Pool 3 (delivery) — Delivery Guy only, EQUAL split (NOT point-weighted —
 *   confirmed explicitly). Funded by: Toast-based delivery tips, i.e. phone
 *   orders or the restaurant's own future platform (4.5% deducted) PLUS
 *   online-platform tips where the RESTAURANT'S OWN driver did the delivery
 *   (not deducted). Cash tips handed directly to a driver are NOT pooled at
 *   all — paid 100% to that individual, tracked separately for reporting.
 *
 *   Host is a member of BOTH Pool 1 and Pool 2. Routing an online-platform
 *   tip to Pool 2 vs Pool 3 depends entirely on who delivered that order —
 *   this needs to be captured per platform-sales record, not assumed.
 *
 * Manager / Floor Manager are in NO pool — commission-only, handled entirely
 * by the generic incentive rules engine, not this file.
 */

export interface PoolRosterEntry {
  employeeId: number;
  pointValue: number;
}

export interface HostDrinkBonusEntry {
  employeeId: number; // the host
  qualifyingDrinkCount: number;
  perDrinkAmount: number; // e.g. 1.00
}

export interface TwoPoolTipCalcInput {
  deductionRate: number; // e.g. 0.045

  // Pool 1 inputs
  grossCcTip: number; // Toast total CC tip — includes dine-in, takeout, AND phone/own-platform delivery
  takeoutCcTip: number; // manually-identified subset of grossCcTip from takeout orders (register pickup)
  hostDrinkBonus: HostDrinkBonusEntry[];
  pool1Roster: PoolRosterEntry[]; // Server/Runner/Bartender/Host/Busser on shift, with this shift's point value

  // Pool 2 inputs
  platformCourierTips: number; // online-platform tips where the PLATFORM'S courier delivered (not deducted)
  pool2Roster: PoolRosterEntry[]; // Host/Operator/Packer/Bag Handler on shift

  // Pool 3 inputs
  deliveryToastTip: number; // manually-identified subset of grossCcTip from phone/own-platform delivery orders (gets deducted)
  platformDeliveryTips: number; // online-platform tips where the RESTAURANT'S OWN driver delivered (not deducted)
  pool3EmployeeIds: number[]; // Delivery Guy employee ids on shift — EQUAL split, no point value needed
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
    deductionRate, grossCcTip, takeoutCcTip, hostDrinkBonus, pool1Roster,
    platformCourierTips, pool2Roster,
    deliveryToastTip, platformDeliveryTips, pool3EmployeeIds,
  } = input;

  if (deductionRate < 0 || deductionRate > 1) throw new Error("deductionRate must be between 0 and 1");
  if (grossCcTip < 0) throw new Error("grossCcTip cannot be negative");
  if (takeoutCcTip < 0) throw new Error("takeoutCcTip cannot be negative");
  if (deliveryToastTip < 0) throw new Error("deliveryToastTip cannot be negative");
  if (takeoutCcTip + deliveryToastTip > grossCcTip) {
    throw new Error("takeoutCcTip + deliveryToastTip cannot exceed grossCcTip");
  }

  // ---- Pool 1: dine-in ----
  const grossDineInCcTip = round2(grossCcTip - takeoutCcTip - deliveryToastTip);
  const netDineInCcTip = round2(grossDineInCcTip * (1 - deductionRate));

  const hostDrinkBonusByEmployee: Record<number, number> = {};
  for (const h of hostDrinkBonus) {
    const amount = round2(h.qualifyingDrinkCount * h.perDrinkAmount);
    hostDrinkBonusByEmployee[h.employeeId] = round2((hostDrinkBonusByEmployee[h.employeeId] ?? 0) + amount);
  }
  const totalHostDrinkBonus = round2(sum(Object.values(hostDrinkBonusByEmployee)));

  const netPool1AfterHostBonus = round2(netDineInCcTip - totalHostDrinkBonus);
  if (netPool1AfterHostBonus < 0) {
    throw new Error(
      "Host drink bonus exceeds the dine-in pool for this shift — check the qualifying drink count / per-drink amount before finalizing this report."
    );
  }

  const pool1ShareByEmployee = splitByPointsExact(netPool1AfterHostBonus, pool1Roster);

  // ---- Pool 2: takeout (register) + platform-courier-delivered online orders ----
  const netTakeoutCcTip = round2(takeoutCcTip * (1 - deductionRate));
  const totalPool2 = round2(netTakeoutCcTip + platformCourierTips);
  const pool2ShareByEmployee = splitByPointsExact(totalPool2, pool2Roster);

  // ---- Pool 3: delivery (Toast phone/own-platform orders + restaurant-driver-delivered online orders) ----
  const netDeliveryToastTip = round2(deliveryToastTip * (1 - deductionRate));
  const totalPool3 = round2(netDeliveryToastTip + platformDeliveryTips);
  const pool3ShareByEmployee = splitEqually(totalPool3, pool3EmployeeIds);

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

/** Pool 3 (Delivery Guy) is explicitly EQUAL split, not point-weighted —
 * confirmed by Oliver. Implemented as splitByPointsExact with every employee
 * at point value 1.0, so it reuses the same exact-cent reconciliation logic
 * rather than duplicating it, but callers don't need to think about points
 * for this pool at all. */
function splitEqually(poolAmount: number, employeeIds: number[]): Record<number, number> {
  return splitByPointsExact(
    poolAmount,
    employeeIds.map((employeeId) => ({ employeeId, pointValue: 1.0 }))
  );
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
function round2(n: number): number {
  const epsilon = n >= 0 ? 1e-9 : -1e-9;
  return Math.round((n + epsilon) * 100) / 100;
}
