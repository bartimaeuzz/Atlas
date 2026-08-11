import { test } from "node:test";
import assert from "node:assert/strict";
import { getVisibleRosterEntries, type RosterEntryView, type Viewer } from "../visibility";

// Split 2026-08-10: showPeerEarningsFOH/BOH (one combined toggle) became
// showPeerTipFOH/BOH + showPeerWageFOH/BOH (independent toggles), still at
// FOH/BOH category granularity. Existing tests below set Tip and Wage to
// the SAME value they used to share, preserving their original intent;
// new tests further down specifically exercise the independent split.
const settingsDefault = {
  showPeerTipFOH: true,
  showPeerTipBOH: false,
  showPeerWageFOH: true,
  showPeerWageBOH: false,
  restrictFOHToOwnCategory: true,
  restrictBOHToOwnCategory: true,
  showCoworkerListFOH: true,
  showCoworkerListBOH: true,
};

const sampleRoster: RosterEntryView[] = [
  { employeeId: 1, positionId: 10, positionCategory: "FOH", positionName: "Server", alwaysVisibleInRoster: false, earningsHiddenFromStaff: false, tipShare: 55.5, flatWage: 60 },
  { employeeId: 2, positionId: 11, positionCategory: "FOH", positionName: "Bartender", alwaysVisibleInRoster: false, earningsHiddenFromStaff: false, tipShare: 62.1, flatWage: 70 },
  { employeeId: 3, positionId: 12, positionCategory: "BOH", positionName: "Line Cook", alwaysVisibleInRoster: false, earningsHiddenFromStaff: false, flatWage: 45 },
  { employeeId: 4, positionId: 13, positionCategory: "BOH", positionName: "Chef", alwaysVisibleInRoster: false, earningsHiddenFromStaff: false, flatWage: 90 },
  { employeeId: 5, positionId: 14, positionCategory: "FOH", positionName: "Floor Manager", alwaysVisibleInRoster: true, earningsHiddenFromStaff: true, flatWage: 80 },
];

test("MANAGER sees everyone, with full money figures", () => {
  const viewer: Viewer = { employeeId: 99, systemRole: "MANAGER", ownCategory: "FOH" };
  const result = getVisibleRosterEntries(viewer, sampleRoster, settingsDefault);
  assert.equal(result.length, 5);
  assert.equal(result.find((e) => e.employeeId === 4)?.flatWage, 90);
});

test("STAFF in FOH sees only FOH entries plus always-visible positions, not BOH", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const result = getVisibleRosterEntries(viewer, sampleRoster, settingsDefault);
  const ids = result.map((e) => e.employeeId).sort();
  assert.deepEqual(ids, [1, 2, 5]); // Server(self), Bartender, Floor Manager — no Line Cook/Chef
});

test("STAFF in BOH sees only BOH entries plus always-visible positions, not FOH", () => {
  const viewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const result = getVisibleRosterEntries(viewer, sampleRoster, settingsDefault);
  const ids = result.map((e) => e.employeeId).sort();
  assert.deepEqual(ids, [3, 4, 5]); // Line Cook(self), Chef, Floor Manager
});

test("default settings: FOH staff sees a peer's money, BOH staff does not", () => {
  const fohViewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const fohResult = getVisibleRosterEntries(fohViewer, sampleRoster, settingsDefault);
  const bartenderEntry = fohResult.find((e) => e.employeeId === 2)!;
  assert.equal(bartenderEntry.tipShare, 62.1); // peer's money visible by default in FOH

  const bohViewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const bohResult = getVisibleRosterEntries(bohViewer, sampleRoster, settingsDefault);
  const chefEntry = bohResult.find((e) => e.employeeId === 4)!;
  assert.equal(chefEntry.flatWage, undefined); // peer's money hidden by default in BOH
  assert.equal(chefEntry.positionName, "Chef"); // but the entry itself (schedule) still shows
});

test("staff always sees their OWN numbers, even when peer earnings are hidden for their category", () => {
  const viewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const result = getVisibleRosterEntries(viewer, sampleRoster, settingsDefault);
  const self = result.find((e) => e.employeeId === 3)!;
  assert.equal(self.flatWage, 45); // own wage still visible
});

test("restaurant can flip the settings — e.g. turn ON peer earnings for BOH", () => {
  const viewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const openSettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, openSettings);
  const chefEntry = result.find((e) => e.employeeId === 4)!;
  assert.equal(chefEntry.flatWage, 90);
});

test("restaurant can flip the settings — e.g. turn OFF peer earnings for FOH", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const closedSettings = {
    showPeerTipFOH: false,
    showPeerTipBOH: false,
    showPeerWageFOH: false,
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, closedSettings);
  const bartenderEntry = result.find((e) => e.employeeId === 2)!;
  assert.equal(bartenderEntry.tipShare, undefined);
});

test("leadership (Floor Manager) pay is hidden from ALL staff, regardless of category or the FOH/BOH earnings settings", () => {
  const fohViewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const fohResult = getVisibleRosterEntries(fohViewer, sampleRoster, {
    showPeerTipFOH: true, // even wide open...
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  });
  const floorManagerForFOH = fohResult.find((e) => e.employeeId === 5)!;
  assert.equal(floorManagerForFOH.flatWage, undefined); // ...still hidden, because it's a leadership position

  const bohViewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const bohResult = getVisibleRosterEntries(bohViewer, sampleRoster, settingsDefault);
  const floorManagerForBOH = bohResult.find((e) => e.employeeId === 5)!;
  assert.equal(floorManagerForBOH.flatWage, undefined);
  assert.equal(floorManagerForBOH.positionName, "Floor Manager"); // schedule visibility unaffected, only pay is hidden
});

test("MANAGER/ADMIN still see leadership pay — the hide rule only applies to STAFF", () => {
  const viewer: Viewer = { employeeId: 99, systemRole: "MANAGER", ownCategory: "FOH" };
  const result = getVisibleRosterEntries(viewer, sampleRoster, settingsDefault);
  const floorManagerEntry = result.find((e) => e.employeeId === 5)!;
  assert.equal(floorManagerEntry.flatWage, 80);
});

test("restaurant can turn OFF category restriction for FOH — FOH staff then see BOH entries too", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const openRoster = {
    showPeerTipFOH: true,
    showPeerTipBOH: false,
    showPeerWageFOH: true,
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: false, // flipped off — this restaurant wants one open roster
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, openRoster);
  const ids = result.map((e) => e.employeeId).sort();
  assert.deepEqual(ids, [1, 2, 3, 4, 5]); // now sees Line Cook and Chef too, not just FOH + always-visible

  // Money visibility is a SEPARATE layer — BOH earnings still follow the
  // showPeerTipBOH/showPeerWageBOH settings even though the entries are now visible.
  const chefEntry = result.find((e) => e.employeeId === 4)!;
  assert.equal(chefEntry.flatWage, undefined);
});

test("restaurant can turn OFF the coworker list for FOH — FOH staff see only their own entry, no one else's name or money", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const noListSettings = {
    showPeerTipFOH: true, // even with peer earnings wide open...
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: false, // ...the list gate wins and hides everyone else
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, noListSettings);
  assert.equal(result.length, 1);
  assert.equal(result[0].employeeId, 1);
  assert.equal(result[0].tipShare, 55.5); // still sees their own numbers
});

test("coworker list setting is independent per category — turning it off for BOH doesn't affect FOH", () => {
  const fohViewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const bohHiddenSettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: false,
    showPeerWageFOH: true,
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: false,
  };
  const fohResult = getVisibleRosterEntries(fohViewer, sampleRoster, bohHiddenSettings);
  const ids = fohResult.map((e) => e.employeeId).sort();
  assert.deepEqual(ids, [1, 2, 5]); // FOH viewer unaffected, still sees Bartender + Floor Manager

  const bohViewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const bohResult = getVisibleRosterEntries(bohViewer, sampleRoster, bohHiddenSettings);
  assert.deepEqual(bohResult.map((e) => e.employeeId), [3]); // BOH viewer sees only self
});

test("MANAGER/ADMIN ignore the coworker-list setting entirely — they always see everyone", () => {
  const viewer: Viewer = { employeeId: 99, systemRole: "MANAGER", ownCategory: "FOH" };
  const noListSettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: true,
    showPeerWageFOH: true,
    showPeerWageBOH: true,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: false,
    showCoworkerListBOH: false,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, noListSettings);
  assert.equal(result.length, 5);
});

test("category restriction settings are independent per category — BOH stays restricted while FOH opens up", () => {
  const bohViewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const mixedSettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: false,
    showPeerWageFOH: true,
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: false,
    restrictBOHToOwnCategory: true, // BOH still locked down
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(bohViewer, sampleRoster, mixedSettings);
  const ids = result.map((e) => e.employeeId).sort();
  assert.deepEqual(ids, [3, 4, 5]); // BOH viewer still restricted to BOH + always-visible, unaffected by FOH's flag
});

/* ---------------------------------------------------------------------- */
/* Tip/Wage split (2026-08-10) — the new behavior these settings enable:  */
/* showing one of tip/wage without the other, per category.                */
/* ---------------------------------------------------------------------- */

test("split settings: FOH peer tip shown, FOH peer wage hidden — same category, independent fields", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const tipOnlySettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: false,
    showPeerWageFOH: false, // wage off even though tip is on, same category
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, tipOnlySettings);
  const bartenderEntry = result.find((e) => e.employeeId === 2)!;
  assert.equal(bartenderEntry.tipShare, 62.1); // tip visible
  assert.equal(bartenderEntry.flatWage, undefined); // wage hidden
});

test("split settings: BOH peer wage shown, BOH peer tip hidden — the reverse split", () => {
  const viewer: Viewer = { employeeId: 3, systemRole: "STAFF", ownCategory: "BOH" };
  const wageOnlySettings = {
    showPeerTipFOH: true,
    showPeerTipBOH: false, // tip off for BOH
    showPeerWageFOH: true,
    showPeerWageBOH: true, // wage on for BOH, opposite of tip
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, wageOnlySettings);
  const chefEntry = result.find((e) => e.employeeId === 4)!;
  assert.equal(chefEntry.flatWage, 90); // wage visible
  // Chef's sample data has no tipShare to begin with, so also check a
  // hypothetical FOH-shaped case isn't accidentally leaking the field:
  assert.equal("tipShare" in chefEntry, false);
});

test("split settings: viewer's own row always shows both tip and wage regardless of category settings", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const allOffSettings = {
    showPeerTipFOH: false,
    showPeerTipBOH: false,
    showPeerWageFOH: false,
    showPeerWageBOH: false,
    restrictFOHToOwnCategory: true,
    restrictBOHToOwnCategory: true,
    showCoworkerListFOH: true,
    showCoworkerListBOH: true,
  };
  const result = getVisibleRosterEntries(viewer, sampleRoster, allOffSettings);
  const self = result.find((e) => e.employeeId === 1)!;
  assert.equal(self.tipShare, 55.5);
  assert.equal(self.flatWage, 60);
});
