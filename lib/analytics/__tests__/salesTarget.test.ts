import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SALES_TARGETS,
  TREND_WEEKS,
  dayOfWeekFor,
  resolveSalesTarget,
  salesDifference,
  salesTrend,
  salesVerdict,
  shiftDate,
  trendLookbackStart,
  type SalesTargets,
} from "../salesTarget";

// 2026-09-01 is a Tuesday, 2026-09-06 a Sunday.
const TUE = "2026-09-01";

const targets: SalesTargets = {
  weekday: { 2: 3800, 0: 2500 }, // Tuesday, Sunday
  dates: { "2026-11-26": 6000 },
};

test("dayOfWeekFor: reads the weekday at UTC noon, not local midnight", () => {
  // The whole reason for the noon pin: a bare "2026-09-01" parses as
  // 31 August in every negative-UTC-offset timezone, which is every
  // timezone this app runs in, and would report Monday for a Tuesday.
  assert.equal(dayOfWeekFor(TUE), 2);
  assert.equal(dayOfWeekFor("2026-09-06"), 0);
});

test("shiftDate: steps backwards across a month boundary", () => {
  assert.equal(shiftDate("2026-09-01", -7), "2026-08-25");
  assert.equal(shiftDate("2026-03-08", -7), "2026-03-01"); // spans a US DST change
});

test("resolveSalesTarget: prefers a date override over the weekday default", () => {
  // 2026-11-26 is a Thursday with no weekday default at all, so this
  // also proves the override does not merely win a tie.
  assert.equal(resolveSalesTarget("2026-11-26", targets), 6000);
});

test("resolveSalesTarget: falls back to the weekday default", () => {
  assert.equal(resolveSalesTarget(TUE, targets), 3800);
});

test("resolveSalesTarget: returns null when nothing is set, never zero", () => {
  // A zero here would mark every Wednesday as beaten by its whole day's
  // sales — the loud wrong answer this convention exists to prevent.
  assert.equal(resolveSalesTarget("2026-09-02", targets), null);
  assert.equal(resolveSalesTarget(TUE, EMPTY_SALES_TARGETS), null);
});

test("salesVerdict: has no verdict without a target", () => {
  assert.equal(salesVerdict(4000, null), "none");
  assert.equal(salesVerdict(null, 3800), "none");
});

test("salesVerdict: counts exactly on target as met, not missed", () => {
  assert.equal(salesVerdict(3800, 3800), "over");
});

test("salesVerdict: reads above as over and below as under", () => {
  assert.equal(salesVerdict(4180, 3800), "over");
  assert.equal(salesVerdict(2910, 3800), "under");
});

test("salesDifference: is signed, positive when above target", () => {
  assert.equal(salesDifference(4180, 3800), 380);
  assert.equal(salesDifference(2910, 3300), -390);
});

test("salesDifference: does not leak float dust into a rendered figure", () => {
  assert.equal(salesDifference(4180.1, 3800.2), 379.9);
});

test("salesDifference: is null without a target", () => {
  assert.equal(salesDifference(4180, null), null);
});

const fourTuesdays = {
  "2026-08-04": 3000,
  "2026-08-11": 3400,
  "2026-08-18": 3600,
  "2026-08-25": 4000,
  [TUE]: 9999, // the day itself must never be counted
};

test("salesTrend: averages the last four same weekdays", () => {
  assert.deepEqual(salesTrend(TUE, fourTuesdays), { average: 3500, weeks: 4 });
});

test("salesTrend: excludes the day being judged", () => {
  // 9999 would drag a five-day mean to 4800; the four-day mean is 3500.
  assert.equal(salesTrend(TUE, fourTuesdays)?.average, 3500);
});

test("salesTrend: ignores the same weekday further back than the window", () => {
  assert.equal(salesTrend(TUE, { ...fourTuesdays, "2026-07-28": 100000 })?.average, 3500);
});

test("salesTrend: ignores other weekdays entirely", () => {
  assert.equal(salesTrend(TUE, { ...fourTuesdays, "2026-08-26": 100000 })?.average, 3500);
});

test("salesTrend: reports how few weeks it actually had", () => {
  // A restaurant open two weeks must say "2 Tuesdays", not imply four.
  assert.deepEqual(salesTrend(TUE, { "2026-08-18": 3600, "2026-08-25": 4000 }), {
    average: 3800,
    weeks: 2,
  });
});

test("salesTrend: is null with no history — Youk's opening week", () => {
  assert.equal(salesTrend(TUE, {}), null);
});

test("trendLookbackStart: reaches back far enough to include the oldest week in the window", () => {
  const start = trendLookbackStart(TUE);
  assert.equal(start, shiftDate(TUE, -7 * TREND_WEEKS));
  assert.equal(start, "2026-08-04");
});
