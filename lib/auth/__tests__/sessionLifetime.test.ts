import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OWN_DEVICE_SESSION_MS,
  SHARED_DEVICE_SESSION_MS,
  sessionCookieMaxAgeSeconds,
  sessionDurationMs,
  sessionExpiresAt,
} from "../sessionLifetime";

const now = new Date("2026-09-01T12:00:00.000Z");

test("sessionLifetime: shared device is 14 hours, own device is 30 days", () => {
  assert.equal(SHARED_DEVICE_SESSION_MS, 14 * 3600 * 1000);
  assert.equal(OWN_DEVICE_SESSION_MS, 30 * 24 * 3600 * 1000);
  assert.equal(sessionDurationMs(false), SHARED_DEVICE_SESSION_MS);
  assert.equal(sessionDurationMs(true), OWN_DEVICE_SESSION_MS);
});

test("sessionLifetime: expiry lands exactly one duration after now", () => {
  assert.equal(sessionExpiresAt(now, false).toISOString(), "2026-09-02T02:00:00.000Z");
  assert.equal(sessionExpiresAt(now, true).toISOString(), "2026-10-01T12:00:00.000Z");
});

test("sessionLifetime: cookie maxAge matches the row expiry in whole seconds", () => {
  assert.equal(sessionCookieMaxAgeSeconds(false), 14 * 3600);
  assert.equal(sessionCookieMaxAgeSeconds(true), 30 * 24 * 3600);
});
