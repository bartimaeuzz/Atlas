import { test } from "node:test";
import assert from "node:assert/strict";
import { needsPointDecision, resolvePointWeightedPools } from "../pointDecision";

const BOTH_WEIGHTED = resolvePointWeightedPools({
  pool1SplitMethod: "POINT_WEIGHTED",
  pool2SplitMethod: "POINT_WEIGHTED",
  pool3SplitMethod: "EQUAL_SPLIT",
});

test("pointDecision: off-role in a point-weighted pool needs a decision", () => {
  // Carlos, a Delivery Guy, put on as Server. No employeePositions row for
  // Server, so his point would silently fall through to the 1.0 fallback.
  assert.equal(
    needsPointDecision(
      { hasStandingPoint: false, tipPoolGroups: ["POOL_1_DINE_IN"], pointDecidedAt: null },
      BOTH_WEIGHTED
    ),
    true
  );
});

test("pointDecision: someone who holds the position is never asked again", () => {
  // Chui is a Server working Server -- his standing point IS the decision.
  assert.equal(
    needsPointDecision(
      { hasStandingPoint: true, tipPoolGroups: ["POOL_1_DINE_IN"], pointDecidedAt: null },
      BOTH_WEIGHTED
    ),
    false
  );
});

test("pointDecision: once decided, it stays decided", () => {
  assert.equal(
    needsPointDecision(
      {
        hasStandingPoint: false,
        tipPoolGroups: ["POOL_1_DINE_IN"],
        pointDecidedAt: "2026-08-29T20:00:00.000Z",
      },
      BOTH_WEIGHTED
    ),
    false
  );
});

test("pointDecision: an equal-split pool is never gated -- the point does nothing there", () => {
  // Pool 3 is EQUAL_SPLIT by default, so demanding a point for a Delivery
  // Guy would be asking for a number that cannot change anyone's money.
  assert.equal(
    needsPointDecision(
      { hasStandingPoint: false, tipPoolGroups: ["POOL_3_DELIVERY"], pointDecidedAt: null },
      BOTH_WEIGHTED
    ),
    false
  );
});

test("pointDecision: a no-pool position (Manager, Chef) is never gated", () => {
  assert.equal(
    needsPointDecision({ hasStandingPoint: false, tipPoolGroups: [], pointDecidedAt: null }, BOTH_WEIGHTED),
    false
  );
});

test("pointDecision: a two-pool row is gated if ANY of its pools is point-weighted", () => {
  // Host spans Pool 1 + Pool 2. Even with only Pool 1 weighted, the point
  // still moves real money, so it still has to be decided.
  const onlyPool1Weighted = resolvePointWeightedPools({
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "EQUAL_SPLIT",
    pool3SplitMethod: "EQUAL_SPLIT",
  });
  assert.equal(
    needsPointDecision(
      {
        hasStandingPoint: false,
        tipPoolGroups: ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE"],
        pointDecidedAt: null,
      },
      onlyPool1Weighted
    ),
    true
  );
});

test("pointDecision: turning every pool equal-split disarms the gate entirely", () => {
  const noneWeighted = resolvePointWeightedPools({
    pool1SplitMethod: "EQUAL_SPLIT",
    pool2SplitMethod: "EQUAL_SPLIT",
    pool3SplitMethod: "EQUAL_SPLIT",
  });
  assert.equal(
    needsPointDecision(
      {
        hasStandingPoint: false,
        tipPoolGroups: ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE"],
        pointDecidedAt: null,
      },
      noneWeighted
    ),
    false
  );
});

test("pointDecision: settings default to the Youk Thai shape when unset", () => {
  assert.deepEqual(resolvePointWeightedPools(undefined), ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE"]);
});

test("pointDecision: a stored override from before the stamp existed counts as decided", () => {
  // Legacy prod row (shift 31, Kris as Busser): someone entered 0.5 back
  // when pointDecidedAt didn't exist. Blocking that shift would ask them
  // to re-decide a point they already decided.
  assert.equal(
    needsPointDecision(
      {
        hasStandingPoint: false,
        tipPoolGroups: ["POOL_1_DINE_IN"],
        pointDecidedAt: null,
        hasExplicitOverride: true,
      },
      BOTH_WEIGHTED
    ),
    false
  );
});

test("pointDecision: no override and no stamp is still undecided", () => {
  // The distinction that makes the stamp necessary: a value equal to the
  // fallback is stored as null, so "no override" alone can't mean decided.
  assert.equal(
    needsPointDecision(
      {
        hasStandingPoint: false,
        tipPoolGroups: ["POOL_1_DINE_IN"],
        pointDecidedAt: null,
        hasExplicitOverride: false,
      },
      BOTH_WEIGHTED
    ),
    true
  );
});
