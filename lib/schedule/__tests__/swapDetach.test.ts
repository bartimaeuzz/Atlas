import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBlockingSwaps } from "../swapDetach";
import type { SwapStatus } from "../loadSwapRequests";

const base = {
  swapId: 1,
  requesterName: "Meji",
  assignmentId: 100,
  date: "2026-08-31",
  period: "Dinner",
  positionId: 6,
  positionName: "Host",
};

test("swapDetach: resolved swaps never block a delete", () => {
  // "put_back", "unclaimed" and "unresolved" joined this list on
  // 2026-09-03. unclaimed/unresolved matter most: they are what a stale
  // open/pending request becomes once its shift has passed, and the whole
  // point of sweeping them is that a dead request must stop jamming a
  // week delete.
  const resolved: SwapStatus[] = ["completed", "declined", "cancelled", "put_back", "unclaimed", "unresolved"];
  for (const status of resolved) {
    assert.equal(describeBlockingSwaps([{ ...base, status }]), null, status);
  }
});

test("swapDetach: an open swap blocks, naming the person, shift and next step", () => {
  const msg = describeBlockingSwaps([{ ...base, status: "open" as SwapStatus }]);
  assert.ok(msg, "should block");
  // The manager must be able to act on the message alone: who, which
  // shift, what state, and where to fix it.
  assert.match(msg!, /Meji/);
  assert.match(msg!, /Host/);
  assert.match(msg!, /Dinner/);
  assert.match(msg!, /still open/);
  assert.match(msg!, /Swaps/);
  // And never leak database vocabulary at a restaurant manager.
  assert.doesNotMatch(msg!, /SQLITE|constraint|FOREIGN KEY|planned_shift_assignments/i);
});

test("swapDetach: pending-approval reads as waiting on a manager, not as open", () => {
  const msg = describeBlockingSwaps([{ ...base, status: "pending_manager_approval" as SwapStatus }]);
  assert.match(msg!, /waiting on a manager decision/);
});

test("swapDetach: one open swap among resolved ones still blocks and names only the open one", () => {
  const msg = describeBlockingSwaps([
    { ...base, swapId: 1, status: "completed" as SwapStatus, requesterName: "Nancy" },
    { ...base, swapId: 2, status: "open" as SwapStatus, requesterName: "Papi", positionName: "Line Cook", period: "Lunch" },
  ]);
  assert.ok(msg);
  assert.match(msg!, /Papi/);
  assert.doesNotMatch(msg!, /Nancy/);
});

test("swapDetach: no swaps at all -- nothing blocks", () => {
  assert.equal(describeBlockingSwaps([]), null);
});
