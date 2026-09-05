import { test } from "node:test";
import assert from "node:assert/strict";
import { weatherMeaning, worstWeatherCode } from "../wmo";
import { describeServiceWindow, serviceWindowHours } from "../serviceWindow";
import { windowFromHours } from "../openMeteo";
import { mergeDayWeather } from "../dayWeather";

test("an unknown weather code renders instead of blanking the screen", () => {
  const meaning = weatherMeaning(4242);
  assert.equal(meaning.label, "Unknown");
  assert.equal(meaning.icon, "cloudy");
  assert.equal(meaning.severe, false);
  assert.equal(weatherMeaning(null).label, "Unknown");
});

test("only genuinely bad weather counts as severe", () => {
  assert.equal(weatherMeaning(0).severe, false); // clear
  assert.equal(weatherMeaning(61).severe, false); // light rain
  assert.equal(weatherMeaning(65).severe, true); // heavy rain
  assert.equal(weatherMeaning(95).severe, true); // thunderstorm
});

test("the worst hour wins, and the WMO scale is not compared as integers", () => {
  // 95 (thunderstorm) beats 3 (overcast) — the obvious case.
  assert.equal(worstWeatherCode([3, 3, 95, 1]), 95);
  // The case a naive Math.max gets wrong: 80 is "light showers" and 65 is
  // "heavy rain", so the LARGER integer is the MILDER weather.
  assert.equal(worstWeatherCode([80, 65]), 65);
  assert.equal(worstWeatherCode([]), null);
});

test("service windows are the hours Oliver confirmed, 11-4 and 5-11", () => {
  assert.deepEqual(serviceWindowHours("Lunch"), [11, 12, 13, 14, 15]);
  assert.deepEqual(serviceWindowHours("Dinner"), [17, 18, 19, 20, 21, 22]);
  assert.equal(describeServiceWindow("Lunch"), "11am – 4pm");
  assert.equal(describeServiceWindow("Dinner"), "5pm – 11pm");
});

const hour = (h: number, tempF: number, precipIn: number, code: number) => ({
  hour: h,
  tempF,
  precipIn,
  code,
});

test("a sunny lunch and a stormy dinner do not average into one bland day", () => {
  const hours = [
    hour(11, 78, 0, 0),
    hour(12, 82, 0, 0),
    hour(13, 84, 0, 1),
    hour(14, 83, 0, 1),
    hour(15, 80, 0, 2),
    hour(17, 72, 0.2, 61),
    hour(18, 69, 0.9, 95),
    hour(19, 68, 0.3, 63),
    hour(20, 68, 0, 3),
    hour(21, 67, 0, 3),
    hour(22, 66, 0, 3),
  ];

  const lunch = windowFromHours(hours, "Lunch");
  assert.equal(lunch?.weatherCode, 2);
  assert.equal(lunch?.tempHighF, 84);
  assert.equal(lunch?.tempLowF, 78);
  assert.equal(lunch?.precipInches, 0);

  const dinner = windowFromHours(hours, "Dinner");
  assert.equal(dinner?.weatherCode, 95, "the 6pm thunderstorm is what dinner had");
  assert.equal(dinner?.tempHighF, 72);
  assert.equal(dinner?.tempLowF, 66);
  assert.equal(dinner?.precipInches, 1.4, "rain is summed across the window, not averaged");
});

test("hours outside the service window are ignored entirely", () => {
  // A 3am blizzard is not something dinner experienced.
  const hours = [hour(3, 20, 2.0, 75), hour(18, 70, 0, 0), hour(19, 71, 0, 0)];
  const dinner = windowFromHours(hours, "Dinner");
  assert.equal(dinner?.weatherCode, 0);
  assert.equal(dinner?.precipInches, 0);
  assert.equal(windowFromHours(hours, "Lunch"), null, "no hours in the window means no answer");
});

test("a float artefact never reaches the screen as rainfall", () => {
  const hours = [hour(11, 70, 0.1, 61), hour(12, 70, 0.2, 61)];
  assert.equal(windowFromHours(hours, "Lunch")?.precipInches, 0.3);
});

const record = (
  period: "Lunch" | "Dinner",
  code: number,
  high: number,
  low: number,
  rain: number,
  source: "LOCK" | "BACKFILL" = "LOCK"
) => ({
  date: "2026-09-13",
  period,
  weatherCode: code,
  tempHighF: high,
  tempLowF: low,
  precipInches: rain,
  source,
});

test("a day's row takes the worst of its two services", () => {
  const merged = mergeDayWeather([record("Lunch", 2, 84, 78, 0), record("Dinner", 95, 72, 66, 1.4)]);
  assert.equal(merged?.weatherCode, 95);
  assert.equal(merged?.tempHighF, 84, "the day's high is the day's high, across both services");
  assert.equal(merged?.tempLowF, 66);
  assert.equal(merged?.precipInches, 1.4);
});

test("merging one service or none is not a special case for the caller", () => {
  const only = record("Dinner", 63, 70, 65, 0.4);
  assert.deepEqual(mergeDayWeather([only]), only);
  assert.equal(mergeDayWeather([]), null);
});

test("a merged day claims 'recorded at close' only when both services were", () => {
  const bothLocked = mergeDayWeather([
    record("Lunch", 2, 84, 78, 0, "LOCK"),
    record("Dinner", 95, 72, 66, 1.4, "LOCK"),
  ]);
  assert.equal(bothLocked?.source, "LOCK");

  // One service filled in later means the day's line must not claim the
  // record was stamped at close — it is a caption on a locked payroll page.
  const oneBackfilled = mergeDayWeather([
    record("Lunch", 2, 84, 78, 0, "LOCK"),
    record("Dinner", 95, 72, 66, 1.4, "BACKFILL"),
  ]);
  assert.equal(oneBackfilled?.source, "BACKFILL");
});
