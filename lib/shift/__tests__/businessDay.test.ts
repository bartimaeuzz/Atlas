import { test } from "node:test";
import assert from "node:assert/strict";
import { businessTodayIso } from "../../formatDateTime";

// 2026-08-25 is EDT (UTC-4).
test("business day: NYC evening is still today, not UTC-tomorrow", () => {
  // 8pm NYC on Aug 25 = 00:00Z Aug 26 -- the exact live bug Oliver hit.
  assert.equal(businessTodayIso(new Date("2026-08-26T00:00:00Z")), "2026-08-25");
});

test("business day: before the 4am cutoff belongs to yesterday", () => {
  // 3:59am NYC Aug 26 = 07:59Z
  assert.equal(businessTodayIso(new Date("2026-08-26T07:59:00Z")), "2026-08-25");
});

test("business day: after the 4am cutoff the new day starts", () => {
  // 4:01am NYC Aug 26 = 08:01Z
  assert.equal(businessTodayIso(new Date("2026-08-26T08:01:00Z")), "2026-08-26");
});

test("business day: midday is plainly today", () => {
  // noon NYC Aug 26 = 16:00Z
  assert.equal(businessTodayIso(new Date("2026-08-26T16:00:00Z")), "2026-08-26");
});

test("business day: EST winter offset still lands right", () => {
  // 3:59am NYC Jan 10 (EST, UTC-5) = 08:59Z -> previous day
  assert.equal(businessTodayIso(new Date("2027-01-10T08:59:00Z")), "2027-01-09");
  assert.equal(businessTodayIso(new Date("2027-01-10T09:01:00Z")), "2027-01-10");
});
