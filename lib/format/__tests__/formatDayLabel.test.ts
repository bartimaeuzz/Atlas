import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDayLabel, formatDayLabelLong, formatDayLabelShort, weekdayOf } from "../formatDayLabel";

test("formatDayLabel: prefixes the weekday and keeps the ISO date intact", () => {
  assert.equal(formatDayLabel("2026-08-22"), "Sat 2026-08-22");
  assert.equal(formatDayLabel("2026-08-24"), "Mon 2026-08-24");
});

test("formatDayLabel: does NOT shift a day in negative-UTC-offset timezones", () => {
  // The bug this guards: a bare "YYYY-MM-DD" parses as midnight UTC, which
  // is the PREVIOUS day everywhere west of Greenwich -- so a New York user
  // would see "Sun" on a date that is a Monday. Pinning to UTC noon and
  // reading getUTCDay() makes the label independent of the runtime zone.
  const prevTz = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    assert.equal(formatDayLabel("2026-08-24"), "Mon 2026-08-24");
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14, the other extreme
    assert.equal(formatDayLabel("2026-08-24"), "Mon 2026-08-24");
  } finally {
    process.env.TZ = prevTz;
  }
});

test("formatDayLabel: covers every weekday", () => {
  // 2026-08-23 is a Sunday.
  const expected = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  expected.forEach((day, i) => {
    const iso = `2026-08-${String(23 + i).padStart(2, "0")}`;
    assert.equal(formatDayLabel(iso), `${day} ${iso}`);
  });
});

test("formatDayLabel: returns the input unchanged when it is not a real date", () => {
  // Report tables render whatever the loader hands them; a malformed value
  // should degrade to the raw string, never to "Invalid Date".
  assert.equal(formatDayLabel("not-a-date"), "not-a-date");
  assert.equal(formatDayLabel(""), "");
});

test("weekdayOf: returns the weekday alone, and empty string on bad input", () => {
  assert.equal(weekdayOf("2026-08-22"), "Sat");
  assert.equal(weekdayOf("nope"), "");
});

test("formatDayLabelLong/Short: full 4-digit year so the month can never read as the date", () => {
  assert.equal(formatDayLabelLong("2026-08-23"), "Sunday, 23 August 2026");
  assert.equal(formatDayLabelShort("2026-08-23"), "Sun, 23 Aug 2026");
});
