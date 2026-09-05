import { test } from "node:test";
import assert from "node:assert/strict";
import { groupThousands, ungroupThousands, ungroupedOffset } from "../groupThousands";

test("commas go in where the money rule says they go", () => {
  assert.equal(groupThousands("15000"), "15,000");
  assert.equal(groupThousands("999"), "999");
  assert.equal(groupThousands("1000"), "1,000");
  assert.equal(groupThousands("1000000"), "1,000,000");
  assert.equal(groupThousands(""), "");
});

test("no digit is ever lost, rounded or re-rendered", () => {
  // The whole reason this is a string transform and not toLocaleString:
  // a stored 3800.50 must come back as 3800.50, not 3801 and not 3800.5.
  assert.equal(groupThousands("3800.50"), "3,800.50");
  assert.equal(groupThousands("3800.567"), "3,800.567");
  assert.equal(groupThousands("0.05"), "0.05");
  // Four decimals would be dropped by toLocaleString's default cap.
  assert.equal(groupThousands("12345.6789"), "12,345.6789");
});

test("a number still being typed is not mangled underneath the typist", () => {
  assert.equal(groupThousands("1500."), "1,500.");
  assert.equal(groupThousands(".5"), ".5");
  assert.equal(groupThousands("-2500"), "-2,500");
  // Not a plain decimal yet — handed back untouched, because refusing a
  // number is the action's job, not the field's.
  assert.equal(groupThousands("1.2.3"), "1.2.3");
  assert.equal(groupThousands("abc"), "abc");
});

test("grouping round-trips exactly, which is what makes the comma safe", () => {
  for (const stored of ["15000", "3800.50", "1000000", "999", "0.05", "12345.6789"]) {
    assert.equal(ungroupThousands(groupThousands(stored)), stored);
    // And the value the action finally parses equals the number stored.
    assert.equal(Number(ungroupThousands(groupThousands(stored))), Number(stored));
  }
});

test("ungrouping removes separators and nothing else", () => {
  assert.equal(ungroupThousands("3,800.50"), "3800.50");
  assert.equal(ungroupThousands("15,000"), "15000");
  assert.equal(ungroupThousands("no commas here"), "no commas here");
});

test("a selection offset survives the commas coming out", () => {
  // Tab into "18,500.75" and the browser has selected 0-9; after the commas
  // go the same selection must be 0-8, not a caret parked at the end.
  assert.equal(ungroupedOffset("18,500.75", 0), 0);
  assert.equal(ungroupedOffset("18,500.75", 9), 8);
  assert.equal(ungroupedOffset("1,000,000", 9), 7);
  // A caret placed just after a comma lands on the digit that followed it.
  assert.equal(ungroupedOffset("18,500.75", 3), 2);
  // No commas, nothing moves.
  assert.equal(ungroupedOffset("500", 3), 3);
  // An index past the end counts only the commas that actually exist.
  assert.equal(ungroupedOffset("1,000", 99), 98);
});
