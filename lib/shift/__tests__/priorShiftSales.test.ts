import { test } from "node:test";
import assert from "node:assert/strict";
import { subtractDayTotals, TOAST_DAY_TOTAL_FIELDS, PLATFORM_DAY_TOTAL_FIELDS } from "../priorShiftSales";

// The scenario this feature exists for (2026-08-31): Toast shows $5,000 at
// Dinner close, but $2,000 of it is Lunch. The saved Dinner figure must be
// $3,000, never $5,000 — $5,000 would inflate Dinner's tip pool and pay
// the wrong crew.
test("priorShiftSales: whole-day entry minus lunch leaves dinner's own share", () => {
  const entered = { totalSales: 5000, salesTax: 443.75, ccTipTotal: 800, takeoutCcTip: 120, deliveryToastTip: 60, cashSales: 900, grossFoodSales: 4200, grossBeverageSales: 800 };
  const lunch = { totalSales: 2000, salesTax: 177.5, ccTipTotal: 300, takeoutCcTip: 40, deliveryToastTip: 20, cashSales: 400, grossFoodSales: 1700, grossBeverageSales: 300 };
  const r = subtractDayTotals(entered, lunch, TOAST_DAY_TOTAL_FIELDS, "Toast", "Lunch");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.totalSales, 3000);
    assert.equal(r.values.salesTax, 266.25);
    assert.equal(r.values.ccTipTotal, 500);
    assert.equal(r.values.takeoutCcTip, 80);
    assert.equal(r.values.deliveryToastTip, 40);
    assert.equal(r.values.cashSales, 500);
    assert.equal(r.values.grossFoodSales, 2500);
    assert.equal(r.values.grossBeverageSales, 500);
  }
});

test("priorShiftSales: keys outside the field list pass through untouched", () => {
  // cashTip is drawer-counted, never Toast-sourced — it must never be
  // subtracted even when it rides in the same record.
  const r = subtractDayTotals(
    { totalSales: 5000, cashTip: 85 },
    { totalSales: 2000, cashTip: 999 },
    [{ key: "totalSales", label: "Total sales" }],
    "Toast",
    "Lunch"
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.totalSales, 3000);
    assert.equal(r.values.cashTip, 85);
  }
});

test("priorShiftSales: a day total smaller than lunch alone is refused, not clamped", () => {
  const r = subtractDayTotals(
    { totalSales: 1800 },
    { totalSales: 2000 },
    [{ key: "totalSales", label: "Total sales" }],
    "Toast",
    "Lunch"
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /Total sales/);
    assert.match(r.error, /\$1800\.00/);
    assert.match(r.error, /\$2000\.00/);
    assert.match(r.error, /Nothing was saved/);
  }
});

test("priorShiftSales: a blank dinner field with a nonzero lunch value is caught", () => {
  // Blank posts as 0. If lunch already recorded a $20 delivery tip, a
  // whole-day 0 is impossible — the day includes lunch. This refusal is
  // what catches "left the field empty by habit" in whole-day mode.
  const r = subtractDayTotals(
    { deliveryToastTip: 0 },
    { deliveryToastTip: 20 },
    [{ key: "deliveryToastTip", label: "Delivery Toast tip" }],
    "Toast",
    "Lunch"
  );
  assert.equal(r.ok, false);
});

test("priorShiftSales: equal values leave zero for this shift (quiet dinner)", () => {
  const r = subtractDayTotals(
    { totalSales: 2000, ccTipTotal: 300 },
    { totalSales: 2000, ccTipTotal: 300 },
    [{ key: "totalSales", label: "Total sales" }, { key: "ccTipTotal", label: "CC tip total" }],
    "Toast",
    "Lunch"
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.totalSales, 0);
    assert.equal(r.values.ccTipTotal, 0);
  }
});

test("priorShiftSales: float cents subtract cleanly", () => {
  // 0.1 + 0.2 class of error: 43.30 − 21.10 must store 22.20, not
  // 22.199999999999996.
  const r = subtractDayTotals(
    { salesTax: 43.3 },
    { salesTax: 21.1 },
    [{ key: "salesTax", label: "Sales tax" }],
    "Toast",
    "Lunch"
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.values.salesTax, 22.2);
});

test("priorShiftSales: platform field list covers the platform record shape", () => {
  const entered = { salesAmount: 600, taxAmount: 53.25, commissionFee: 90, tipAmountPlatformCourier: 40, tipAmountRestaurantDelivery: 12 };
  const lunch = { salesAmount: 250, taxAmount: 22.19, commissionFee: 37.5, tipAmountPlatformCourier: 15, tipAmountRestaurantDelivery: 0 };
  const r = subtractDayTotals(entered, lunch, PLATFORM_DAY_TOTAL_FIELDS, "DoorDash", "Lunch");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.salesAmount, 350);
    assert.equal(r.values.taxAmount, 31.06);
    assert.equal(r.values.commissionFee, 52.5);
    assert.equal(r.values.tipAmountPlatformCourier, 25);
    assert.equal(r.values.tipAmountRestaurantDelivery, 12);
  }
});

test("priorShiftSales: missing keys on either side default to zero", () => {
  const r = subtractDayTotals({}, {}, TOAST_DAY_TOTAL_FIELDS, "Toast", "Lunch");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.values.totalSales, 0);
});
