/**
 * Permission System Phase C (2026-08-21) — which nav destinations are
 * behind a view capability.
 *
 * Deliberately its own module rather than an export from NavBarClient:
 * that file is "use client", and every export of a client module becomes
 * a client reference in the App Router, so a server component (NavBar)
 * reading a plain object out of it is not something to rely on. Both
 * sides import this instead — one shared list, no duplicated capability
 * key strings.
 *
 * An href absent from this map is never hidden.
 */
export const NAV_ITEM_CAPABILITY: Record<string, string> = {
  "/ledger": "VIEW_LEDGER_OVERVIEW",
  "/analytics": "VIEW_ANALYTICS",
  "/settings": "VIEW_SETTINGS",
};

/**
 * The Ledger entry point is the one nav destination that isn't a
 * one-capability question (2026-08-21, from the Phase C scrutinize
 * pass). The Ledger area has two independent view keys, and the Card
 * report has no nav item or home tile of its own — so someone granted
 * VIEW_LEDGER_CARD_REPORT while VIEW_LEDGER_OVERVIEW is revoked could
 * previously reach the Card report only by typing the URL.
 *
 * That combination isn't the default (the registry gives every manager
 * tier VIEW_LEDGER_OVERVIEW, and Admin+Partner the card key on top), so
 * it takes an admin deliberately unticking one box — but "you hold this
 * capability and there is no way to use it" is a bug however rare, and
 * resolving the destination is cheaper than adding a second tile every
 * normal user would also see.
 *
 * Returns null when neither key is held, which is the signal to hide the
 * Ledger tile / nav item entirely.
 */
export function resolveLedgerHref(has: (capabilityKey: string) => boolean): string | null {
  if (has("VIEW_LEDGER_OVERVIEW")) return "/ledger";
  if (has("VIEW_LEDGER_CARD_REPORT")) return "/ledger/card";
  return null;
}
