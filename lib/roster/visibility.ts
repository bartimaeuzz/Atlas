/**
 * Roster visibility — confirmed 2026-08-08.
 *
 * Two independent layers, easy to conflate but must stay separate:
 *   - FILTERING is a UI convenience (view All / FOH only / BOH only / one
 *     position) — not implemented here, that's a plain query/UI concern.
 *   - VISIBILITY (this file) is a permission: what is this specific logged-in
 *     employee even ALLOWED to see, before any filter is applied.
 *
 * Rules:
 *   - MANAGER / ADMIN see the entire roster, with full money figures always.
 *   - STAFF see roster entries in their OWN position category (FOH sees FOH,
 *     BOH sees BOH), PLUS any position flagged `alwaysVisibleInRoster`
 *     (e.g. Floor Manager, Manager) regardless of category, so everyone can
 *     see who's running the shift. Corrected 2026-08-10: this restriction
 *     is now restaurant-configurable per category (`restrictFOHToOwnCategory`
 *     / `restrictBOHToOwnCategory`, both default true = today's behavior)
 *     — some restaurants want a fully open roster instead. Independent per
 *     category, same reasoning as the peer-earnings split below.
 *   - Within what a STAFF member can see, money figures (tip share / flat
 *     wage) on OTHER people's entries are hidden/shown by this precedence:
 *       1. It's the viewer's own entry -> always shown.
 *       2. The entry's position is flagged `earningsHiddenFromStaff` (e.g.
 *          Floor Manager, Manager — "หัวหน้า") -> always hidden from staff,
 *          regardless of category. Corrected 2026-08-08: leadership pay
 *          should never be visible to the people they lead, this isn't a
 *          FOH/BOH sensitivity question at all.
 *       3. Otherwise, keyed by THAT ENTRY's category via a restaurant
 *          setting — FOH defaults visible (pooled/shared tips, less
 *          sensitive), BOH defaults hidden (individually-negotiated wages,
 *          legitimately unequal, showing them risks friction). Both
 *          restaurant-configurable. Split 2026-08-10: tip share and flat
 *          wage are now INDEPENDENT toggles per category (showPeerTipFOH/
 *          BOH, showPeerWageFOH/BOH) rather than one combined switch — a
 *          restaurant can show a peer's tip share while still hiding their
 *          wage, or vice versa. Still category-level, not per-employee
 *          (confirmed with Oliver — that's a bigger ACL change, not asked
 *          for here).
 *   - Added 2026-08-10: even earlier than all of the above, a STAFF viewer
 *     can be denied the coworker list ENTIRELY — not just peers' money,
 *     the peer rows themselves (name + position) — via
 *     `showCoworkerListFOH`/`showCoworkerListBOH`, keyed by the VIEWER's
 *     own category (same convention as `restrictFOHToOwnCategory`/
 *     `restrictBOHToOwnCategory`). When off, only the viewer's own entry
 *     is returned. This is a coarser, earlier gate than the money-hiding
 *     rule above — if it's off, nothing else in this function matters.
 */

export type PositionCategory = "FOH" | "BOH";
export type SystemRole = "STAFF" | "MANAGER" | "ADMIN";

export interface RosterEntryView {
  employeeId: number;
  positionId: number;
  positionCategory: PositionCategory;
  positionName: string;
  alwaysVisibleInRoster: boolean;
  earningsHiddenFromStaff: boolean;
  tipShare?: number;
  flatWage?: number;
  [key: string]: unknown;
}

export interface Viewer {
  employeeId: number;
  systemRole: SystemRole;
  ownCategory: PositionCategory;
}

export interface RosterVisibilitySettings {
  showPeerTipFOH: boolean;
  showPeerTipBOH: boolean;
  showPeerWageFOH: boolean;
  showPeerWageBOH: boolean;
  restrictFOHToOwnCategory: boolean;
  restrictBOHToOwnCategory: boolean;
  showCoworkerListFOH: boolean;
  showCoworkerListBOH: boolean;
}

export function getVisibleRosterEntries(
  viewer: Viewer,
  allEntries: RosterEntryView[],
  settings: RosterVisibilitySettings
): RosterEntryView[] {
  if (viewer.systemRole === "MANAGER" || viewer.systemRole === "ADMIN") {
    return allEntries;
  }

  const viewerCanSeeCoworkerList =
    viewer.ownCategory === "FOH" ? settings.showCoworkerListFOH : settings.showCoworkerListBOH;

  if (!viewerCanSeeCoworkerList) {
    return allEntries.filter((e) => e.employeeId === viewer.employeeId);
  }

  const viewerIsRestricted =
    viewer.ownCategory === "FOH" ? settings.restrictFOHToOwnCategory : settings.restrictBOHToOwnCategory;

  const visible = viewerIsRestricted
    ? allEntries.filter((e) => e.positionCategory === viewer.ownCategory || e.alwaysVisibleInRoster)
    : allEntries;

  return visible.map((entry) => {
    if (entry.employeeId === viewer.employeeId) return entry; // always see your own numbers

    if (entry.earningsHiddenFromStaff) {
      const { tipShare, flatWage, ...withoutMoney } = entry;
      return withoutMoney as RosterEntryView;
    }

    const showTip = entry.positionCategory === "FOH" ? settings.showPeerTipFOH : settings.showPeerTipBOH;
    const showWage = entry.positionCategory === "FOH" ? settings.showPeerWageFOH : settings.showPeerWageBOH;

    if (showTip && showWage) return entry;

    // Independent per-field redaction (2026-08-10 split) — strip both out
    // then add back whichever one(s) this category is allowed to see,
    // rather than the old all-or-nothing removal.
    const { tipShare, flatWage, ...withoutMoney } = entry;
    return {
      ...withoutMoney,
      ...(showTip ? { tipShare } : {}),
      ...(showWage ? { flatWage } : {}),
    } as RosterEntryView;
  });
}
