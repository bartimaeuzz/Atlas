import { test } from "node:test";
import assert from "node:assert/strict";
import { grantAllows, buildViewerCapabilities } from "../viewerCapabilities";
import { CAPABILITIES, isValidCapabilityKey } from "../capabilities";
import { NAV_ITEM_CAPABILITY } from "@/app/navItemCapabilities";
import type { StaffSessionEmployee } from "@/lib/auth/session";

/** Every capability key used as a page-level view guard by Phase C. Kept
 * here so the "does this key exist" check below covers the page guards
 * too, not just the nav map. */
const PAGE_GUARD_KEYS = [
  "VIEW_ANALYTICS",
  "VIEW_PNL",
  "VIEW_SETTINGS",
  "EDIT_SETTINGS",
  "VIEW_LEDGER_OVERVIEW",
  "VIEW_LEDGER_CARD_REPORT",
];

/**
 * grantAllows is the one shared definition of "this viewer holds this
 * capability" — the Phase B action guard (requireCapability) and the
 * Phase C page view guards both route through it, so these cases pin the
 * behaviour both halves depend on. Anything that changes here changes
 * what every gated page AND every gated server action does.
 */
const today = "2026-08-21";

test("grantAllows: allows an Admin even with no capability row at all", () => {
  // Why this matters: production had a real ADMIN account with zero
  // capability rows (Oliver's own, id 16) when Phase B shipped. A
  // row-only check would have locked the Admin out of the admin
  // surface. See requireCapability.ts's header.
  assert.equal(grantAllows(true, undefined, today), true);
});

test("grantAllows: allows an Admin whose row is explicitly not granted", () => {
  assert.equal(grantAllows(true, { granted: false, expiresAt: null }, today), true);
});

test("grantAllows: denies a non-Admin with no row (no row means not granted)", () => {
  assert.equal(grantAllows(false, undefined, today), false);
});

test("grantAllows: denies a non-Admin whose row is granted=false", () => {
  assert.equal(grantAllows(false, { granted: false, expiresAt: null }, today), false);
});

test("grantAllows: allows a non-Admin with a granted row and no expiry", () => {
  assert.equal(grantAllows(false, { granted: true, expiresAt: null }, today), true);
});

test("grantAllows: allows a granted row expiring in the future", () => {
  assert.equal(grantAllows(false, { granted: true, expiresAt: "2026-12-31" }, today), true);
});

test("grantAllows: allows a granted row expiring today (expiry is exclusive, not inclusive)", () => {
  // Matches the shipped Phase B comparison (`expiresAt < today`): the
  // capability stays usable through the whole of its expiry date.
  assert.equal(grantAllows(false, { granted: true, expiresAt: today }, today), true);
});

test("grantAllows: denies a granted row that expired yesterday", () => {
  assert.equal(grantAllows(false, { granted: true, expiresAt: "2026-08-20" }, today), false);
});

test("grantAllows: denies an expired row even though granted is still true", () => {
  assert.equal(grantAllows(false, { granted: true, expiresAt: "2020-01-01" }, today), false);
});

/**
 * buildViewerCapabilities is the part Phase C actually added: turning an
 * employee's capability rows into a has() answer. These cases cover the
 * mapping itself — grantAllows above only covers the per-row decision,
 * and would still pass if the map were keyed on the wrong column.
 */
const MANAGER = { id: 1, name: "Aey", systemRole: "MANAGER" } as unknown as StaffSessionEmployee;
const ADMIN = { id: 16, name: "Oliver", systemRole: "ADMIN" } as unknown as StaffSessionEmployee;

test("buildViewerCapabilities: reads the row matching the requested key", () => {
  const viewer = buildViewerCapabilities(
    MANAGER,
    [
      { capabilityKey: "VIEW_ANALYTICS", granted: true, expiresAt: null },
      { capabilityKey: "VIEW_PNL", granted: false, expiresAt: null },
    ],
    today,
  );
  assert.equal(viewer.has("VIEW_ANALYTICS"), true);
  assert.equal(viewer.has("VIEW_PNL"), false);
});

test("buildViewerCapabilities: a key with no row at all is denied", () => {
  const viewer = buildViewerCapabilities(MANAGER, [], today);
  assert.equal(viewer.has("VIEW_LEDGER_OVERVIEW"), false);
});

test("buildViewerCapabilities: honours a row's expiry", () => {
  const viewer = buildViewerCapabilities(
    MANAGER,
    [{ capabilityKey: "FA_LEDGER_CARD_RECONCILE", granted: true, expiresAt: "2026-08-20" }],
    today,
  );
  assert.equal(viewer.has("FA_LEDGER_CARD_RECONCILE"), false);
});

test("buildViewerCapabilities: Admin passes every key with no rows at all", () => {
  // The lockout guard that matters most -- Oliver's real ADMIN account
  // had zero capability rows in production when Phase B shipped.
  const viewer = buildViewerCapabilities(ADMIN, [], today);
  assert.equal(viewer.isAdmin, true);
  for (const def of CAPABILITIES) {
    assert.equal(viewer.has(def.key), true, `Admin should hold ${def.key}`);
  }
});

test("buildViewerCapabilities: Admin passes even a key explicitly revoked in a row", () => {
  const viewer = buildViewerCapabilities(ADMIN, [{ capabilityKey: "VIEW_SETTINGS", granted: false, expiresAt: null }], today);
  assert.equal(viewer.has("VIEW_SETTINGS"), true);
});

test("buildViewerCapabilities: a non-Admin manager is not silently elevated", () => {
  const viewer = buildViewerCapabilities(MANAGER, [], today);
  assert.equal(viewer.isAdmin, false);
  assert.equal(viewer.has("VIEW_SETTINGS"), false);
});

test("buildViewerCapabilities: an unknown key throws rather than answering false", () => {
  // Answering false would hide a page from everyone forever with nothing
  // to notice; a typo in a nav/tile capability map should be loud.
  const viewer = buildViewerCapabilities(MANAGER, [], today);
  assert.throws(() => viewer.has("VIEW_ANALYTIC"), /Unknown capability key/);
});

test("buildViewerCapabilities: last row wins for a duplicated key", () => {
  // Pins current behaviour rather than endorsing it -- the table has a
  // unique constraint per (employee, capability), so this only matters
  // if that ever changes.
  const viewer = buildViewerCapabilities(
    MANAGER,
    [
      { capabilityKey: "VIEW_ANALYTICS", granted: false, expiresAt: null },
      { capabilityKey: "VIEW_ANALYTICS", granted: true, expiresAt: null },
    ],
    today,
  );
  assert.equal(viewer.has("VIEW_ANALYTICS"), true);
});

test("every capability key referenced by the nav/tile guards really exists", () => {
  // A typo in one of these maps would throw inside NavBar, which renders
  // in the ROOT layout -- i.e. it would take down every page in the app,
  // not just one. Cheaper to catch here.
  for (const key of Object.values(NAV_ITEM_CAPABILITY)) {
    assert.equal(isValidCapabilityKey(key), true, `NAV_ITEM_CAPABILITY references unknown key ${key}`);
  }
  for (const key of PAGE_GUARD_KEYS) {
    assert.equal(isValidCapabilityKey(key), true, `page guard references unknown key ${key}`);
  }
});
