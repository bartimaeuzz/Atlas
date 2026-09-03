import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildOnLeaveLookup } from "../onLeave";

/** The overlap arithmetic behind "is this person off that day" -- the rule
 * auto-fill and template generation both write against (2026-09-03). The
 * boundary cases are the point: leave is INCLUSIVE at both ends, and a
 * span that starts before or ends after the week still blocks the days it
 * covers inside it. */
describe("buildOnLeaveLookup", () => {
  const onLeave = buildOnLeaveLookup([
    { employeeId: 1, startDate: "2026-09-08", endDate: "2026-09-08" }, // single day
    { employeeId: 2, startDate: "2026-09-06", endDate: "2026-09-09" }, // spans into the week
    { employeeId: 2, startDate: "2026-09-20", endDate: "2026-09-21" }, // second span, same person
  ]);

  test("a single-day leave blocks exactly that day", () => {
    assert.equal(onLeave(1, "2026-09-08"), true);
    assert.equal(onLeave(1, "2026-09-07"), false);
    assert.equal(onLeave(1, "2026-09-09"), false);
  });

  test("both ends of the range are inclusive", () => {
    assert.equal(onLeave(2, "2026-09-06"), true);
    assert.equal(onLeave(2, "2026-09-09"), true);
  });

  test("a span that starts before the week still blocks days inside it", () => {
    assert.equal(onLeave(2, "2026-09-07"), true);
    assert.equal(onLeave(2, "2026-09-08"), true);
  });

  test("days outside every span are free", () => {
    assert.equal(onLeave(2, "2026-09-05"), false);
    assert.equal(onLeave(2, "2026-09-10"), false);
  });

  test("a second span for the same person is honoured too", () => {
    assert.equal(onLeave(2, "2026-09-20"), true);
    assert.equal(onLeave(2, "2026-09-21"), true);
    assert.equal(onLeave(2, "2026-09-22"), false);
  });

  test("someone with no leave at all is never blocked", () => {
    assert.equal(onLeave(99, "2026-09-08"), false);
  });

  test("an empty set blocks nobody", () => {
    assert.equal(buildOnLeaveLookup([])(1, "2026-09-08"), false);
  });
});
