import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLEARED_LOCKOUT,
  LOCKOUT_MINUTES,
  LOCKOUT_THRESHOLD,
  formatMinutes,
  lockoutMinutesLeft,
  recordFailedAttempt,
} from "../lockout";

const now = new Date("2026-09-01T12:00:00.000Z");

test("lockout: a clean account is not locked", () => {
  assert.equal(lockoutMinutesLeft(CLEARED_LOCKOUT, now), 0);
});

test("lockout: an expired lock counts as not locked", () => {
  const past = new Date(now.getTime() - 1000).toISOString();
  assert.equal(lockoutMinutesLeft({ failedAttempts: 0, lockedUntil: past }, now), 0);
});

test("lockout: a lock exactly at now is already over", () => {
  assert.equal(lockoutMinutesLeft({ failedAttempts: 0, lockedUntil: now.toISOString() }, now), 0);
});

test("lockout: a garbage timestamp never locks anyone out forever", () => {
  assert.equal(lockoutMinutesLeft({ failedAttempts: 0, lockedUntil: "not-a-date" }, now), 0);
});

test("lockout: minutes left round UP, never down to zero while still locked", () => {
  const in30s = new Date(now.getTime() + 30_000).toISOString();
  assert.equal(lockoutMinutesLeft({ failedAttempts: 0, lockedUntil: in30s }, now), 1);
  const in14m01s = new Date(now.getTime() + 14 * 60000 + 1000).toISOString();
  assert.equal(lockoutMinutesLeft({ failedAttempts: 0, lockedUntil: in14m01s }, now), 15);
});

test("lockout: tries 1 through 4 only count; the 5th locks for 15 minutes with the counter reset", () => {
  let state = CLEARED_LOCKOUT;
  for (let i = 1; i < LOCKOUT_THRESHOLD; i++) {
    const r = recordFailedAttempt(state, now);
    assert.equal(r.locked, false, `try ${i} must not lock`);
    assert.equal(r.next.failedAttempts, i);
    assert.equal(r.next.lockedUntil, null);
    state = r.next;
  }
  const fifth = recordFailedAttempt(state, now);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.next.failedAttempts, 0);
  assert.equal(fifth.next.lockedUntil, new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString());
  assert.equal(lockoutMinutesLeft(fifth.next, now), LOCKOUT_MINUTES);
});

test("lockout: a wrong try while not yet at threshold keeps any stale (expired) lockedUntil untouched", () => {
  const past = new Date(now.getTime() - 60000).toISOString();
  const r = recordFailedAttempt({ failedAttempts: 0, lockedUntil: past }, now);
  assert.equal(r.locked, false);
  assert.equal(r.next.lockedUntil, past);
  assert.equal(lockoutMinutesLeft(r.next, now), 0);
});

test("formatMinutes: singular and plural", () => {
  assert.equal(formatMinutes(1), "1 minute");
  assert.equal(formatMinutes(15), "15 minutes");
});
