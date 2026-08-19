import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_TIMEOUT_MS,
  ACTIVITY_TOUCH_THROTTLE_MS,
  isIdleExpired,
  idleCutoff,
  shouldTouchActivity,
  msUntilIdleTimeout,
} from "../idleTimeout";

const t0 = new Date("2026-08-19T12:00:00.000Z");

test("isIdleExpired: false right at last activity", () => {
  assert.equal(isIdleExpired(t0, t0), false);
});

test("isIdleExpired: false just under the 30-minute mark", () => {
  const now = new Date(t0.getTime() + IDLE_TIMEOUT_MS - 1);
  assert.equal(isIdleExpired(t0, now), false);
});

test("isIdleExpired: true exactly at the 30-minute mark (boundary is inclusive)", () => {
  const now = new Date(t0.getTime() + IDLE_TIMEOUT_MS);
  assert.equal(isIdleExpired(t0, now), true);
});

test("isIdleExpired: true well past 30 minutes", () => {
  const now = new Date(t0.getTime() + IDLE_TIMEOUT_MS + 60_000);
  assert.equal(isIdleExpired(t0, now), true);
});

test("idleCutoff: is exactly IDLE_TIMEOUT_MS before now", () => {
  const now = new Date("2026-08-19T13:00:00.000Z");
  assert.equal(idleCutoff(now).getTime(), now.getTime() - IDLE_TIMEOUT_MS);
});

test("idleCutoff + isIdleExpired agree: lastActivityAt after the cutoff is not expired, at/before it is", () => {
  const now = new Date("2026-08-19T13:00:00.000Z");
  const cutoff = idleCutoff(now);
  assert.equal(isIdleExpired(new Date(cutoff.getTime() + 1000), now), false);
  assert.equal(isIdleExpired(cutoff, now), true);
});

test("shouldTouchActivity: false immediately after a touch", () => {
  assert.equal(shouldTouchActivity(t0, t0), false);
});

test("shouldTouchActivity: false just under the throttle window", () => {
  const now = new Date(t0.getTime() + ACTIVITY_TOUCH_THROTTLE_MS - 1);
  assert.equal(shouldTouchActivity(t0, now), false);
});

test("shouldTouchActivity: true once the throttle window has passed", () => {
  const now = new Date(t0.getTime() + ACTIVITY_TOUCH_THROTTLE_MS + 1);
  assert.equal(shouldTouchActivity(t0, now), true);
});

test("msUntilIdleTimeout: full window right after activity", () => {
  assert.equal(msUntilIdleTimeout(t0, t0), IDLE_TIMEOUT_MS);
});

test("msUntilIdleTimeout: counts down linearly", () => {
  const now = new Date(t0.getTime() + 5 * 60 * 1000);
  assert.equal(msUntilIdleTimeout(t0, now), IDLE_TIMEOUT_MS - 5 * 60 * 1000);
});

test("msUntilIdleTimeout: clamps to 0, never negative, once past the timeout", () => {
  const now = new Date(t0.getTime() + IDLE_TIMEOUT_MS + 60_000);
  assert.equal(msUntilIdleTimeout(t0, now), 0);
});
