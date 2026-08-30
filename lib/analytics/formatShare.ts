/** Shared "share of revenue" formatter for the Analytics page (2026-08-30).
 *
 * Lives in lib/ rather than beside its two callers so it is reachable by the
 * test runner -- package.json's test script globs lib only, not app -- the same
 * reason computePnL was split out of loadPnL.
 *
 * Two things it exists to prevent, both found on the live page:
 *
 * 1. **A real cost reading as none.** The live P&L showed
 *    `Drinks cost (non-alcoholic)  -$16.00  0.0%`. The rounding was honest
 *    (16 / 211,385 = 0.0076%) but "0.0%" reads as "nothing" rather than "very
 *    small" -- the same conflation of absent-with-negligible that c529d32 had
 *    to fix for a 0 pt tip point. A non-zero value that rounds to nothing now
 *    renders `<0.1%`, which says "small" without claiming "none". An exact
 *    zero still renders "0.0%", because there it IS the fact.
 * 2. **"-0.0%".** `(-0.0076).toFixed(1)` is the string "-0.0", so a
 *    break-even loss line could print a signed zero. Rounding runs on the
 *    magnitude first, so that string can no longer be produced.
 *
 * Used by BOTH the P&L table and the KPI meter cards on purpose: the same
 * ratio must not read as "<0.1%" in the table and "0.0%" on the card above it.
 */
export function formatShare(share: number | null): string {
  // null means there was no revenue in the range to divide by -- "nothing to
  // compare against", which an em dash says and 0.0% would not.
  if (share == null) return "—";

  const pct = share * 100;
  const roundsToNothing = Math.abs(pct) < 0.05;

  if (pct !== 0 && roundsToNothing) return pct < 0 ? "-<0.1%" : "<0.1%";
  return `${(roundsToNothing ? 0 : pct).toFixed(1)}%`;
}
