import { test } from "node:test";
import assert from "node:assert/strict";
import { getVisibleRosterEntries, type RosterEntryView, type Viewer } from "../visibility";

const settingsDefault = { showPeerEarningsFOH: true, showPeerEarningsBOH: false };

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
  const openSettings = { showPeerEarningsFOH: true, showPeerEarningsBOH: true };
  const result = getVisibleRosterEntries(viewer, sampleRoster, openSettings);
  const chefEntry = result.find((e) => e.employeeId === 4)!;
  assert.equal(chefEntry.flatWage, 90);
});

test("restaurant can flip the settings — e.g. turn OFF peer earnings for FOH", () => {
  const viewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const closedSettings = { showPeerEarningsFOH: false, showPeerEarningsBOH: false };
  const result = getVisibleRosterEntries(viewer, sampleRoster, closedSettings);
  const bartenderEntry = result.find((e) => e.employeeId === 2)!;
  assert.equal(bartenderEntry.tipShare, undefined);
});

test("leadership (Floor Manager) pay is hidden from ALL staff, regardless of category or the FOH/BOH earnings settings", () => {
  const fohViewer: Viewer = { employeeId: 1, systemRole: "STAFF", ownCategory: "FOH" };
  const fohResult = getVisibleRosterEntries(fohViewer, sampleRoster, {
    showPeerEarningsFOH: true, // even wide open...
    showPeerEarningsBOH: true,
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
