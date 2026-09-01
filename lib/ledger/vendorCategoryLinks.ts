/** Learned vendor <-> category links (2026-08-31).
 *
 * Replaces the free-text vendor tags shipped earlier the same day, which
 * were a misreading of the ask. Oliver's actual words: "when you select
 * the categories and show the suppliers that are related to those
 * categories. Some vendors may fall in multiple categories."
 *
 * So: nothing to type in, no new table, no migration. Every petty cash
 * entry and every supplier invoice already carries BOTH a vendor and a
 * category, which means the pairs that keep turning up together are
 * already the answer to "which of these are the bar suppliers". The link
 * is read back out of the restaurant's own history instead of being
 * maintained by hand -- a list nobody has to keep up to date is a list
 * that can't go stale.
 *
 * Deliberately a pure module: the counting, the threshold and the
 * tie-break are testable without a database, and the loader
 * (loadVendorCategoryLinks.ts) stays a thin caller -- same split as
 * lib/shift/priorShiftSales.ts. The two live in separate files rather
 * than one so `npm test` never has to import db/client.
 */

/** One (vendor, category) pair, already counted by the database. Kept
 * pre-aggregated on purpose: the alternative is reading every petty cash
 * row and every invoice row into memory to count them in JS, which grows
 * without bound as the restaurant uses the app. GROUP BY caps this at
 * vendors x categories.
 *
 * `lastUsedAt` is the business date of the most recent use, ISO
 * yyyy-mm-dd, so plain string comparison orders it correctly. */
export interface VendorCategoryUsage {
  vendorId: number;
  categoryId: number;
  uses: number;
  lastUsedAt: string;
}

/** How many times a vendor must have been used under a category before
 * that counts as a link. TWO, not one, and this is the whole safety
 * margin of the feature: a single mis-picked category is a typo, and a
 * typo must never teach the picker to hide the right vendor or to
 * auto-fill the wrong category. */
export const LINK_MIN_USES = 2;

export interface VendorCategoryLinks {
  /** categoryId -> every vendor linked to it. */
  vendorIdsByCategory: Map<number, Set<number>>;
  /** vendorId -> every category it is linked to, best first (most used,
   * then most recent). Drives the reverse suggestion, and the LENGTH of
   * this list is what decides whether Atlas fills the category in or only
   * offers it -- see the note just below. */
  categoryIdsByVendor: Map<number, number[]>;
  /** vendorId -> the first entry of the list above, for callers that only
   * want the single best guess. */
  topCategoryByVendor: Map<number, number>;
}

// Why the LENGTH of categoryIdsByVendor matters and not just its head
// (2026-08-31 UX research pass): people do not correct values that are
// already filled in for them (Johnson & Goldstein 2003 on default bias).
// A category is not cosmetic here -- it feeds the P&L -- so a confident
// wrong default would quietly mis-book money, which is what rule 6
// exists to prevent. One linked category is a fact worth filling in; two
// or more is a question, and a question gets asked rather than answered
// on the manager's behalf. The forms act on this in
// app/(protected)/ledger/useVendorCategoryPair.ts.

/** Most uses wins. A tie goes to whichever was used most recently -- that
 * is the relationship still alive. A dead tie goes to the lower category
 * id, purely so the suggestion is stable page-load to page-load instead
 * of following whatever order the rows arrived in. */
function beats(candidate: VendorCategoryUsage, current: VendorCategoryUsage): boolean {
  if (candidate.uses !== current.uses) return candidate.uses > current.uses;
  if (candidate.lastUsedAt !== current.lastUsedAt) return candidate.lastUsedAt > current.lastUsedAt;
  return candidate.categoryId < current.categoryId;
}

export function buildVendorCategoryLinks(rows: VendorCategoryUsage[]): VendorCategoryLinks {
  // The same pair arrives twice -- once from petty cash, once from
  // supplier invoices. It is one relationship, so the counts add up.
  // Counting the two sides separately would leave a vendor used once on
  // each side sitting under the threshold forever.
  const merged = new Map<string, VendorCategoryUsage>();
  for (const row of rows) {
    const key = `${row.vendorId}:${row.categoryId}`;
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...row });
      continue;
    }
    seen.uses += row.uses;
    if (row.lastUsedAt > seen.lastUsedAt) seen.lastUsedAt = row.lastUsedAt;
  }

  const vendorIdsByCategory = new Map<number, Set<number>>();
  const topByVendor = new Map<number, VendorCategoryUsage>();
  const rowsByVendor = new Map<number, VendorCategoryUsage[]>();

  for (const row of merged.values()) {
    if (row.uses < LINK_MIN_USES) continue;

    const forVendor = rowsByVendor.get(row.vendorId);
    if (forVendor) forVendor.push(row);
    else rowsByVendor.set(row.vendorId, [row]);

    let vendorIds = vendorIdsByCategory.get(row.categoryId);
    if (!vendorIds) {
      vendorIds = new Set<number>();
      vendorIdsByCategory.set(row.categoryId, vendorIds);
    }
    vendorIds.add(row.vendorId);

    const current = topByVendor.get(row.vendorId);
    if (!current || beats(row, current)) topByVendor.set(row.vendorId, row);
  }

  const topCategoryByVendor = new Map<number, number>();
  for (const [vendorId, row] of topByVendor) topCategoryByVendor.set(vendorId, row.categoryId);

  // Ranked best-first with the same comparator, so the top of each list
  // and topCategoryByVendor can never disagree.
  const categoryIdsByVendor = new Map<number, number[]>();
  for (const [vendorId, rows] of rowsByVendor) {
    rows.sort((a, b) => (beats(a, b) ? -1 : beats(b, a) ? 1 : 0));
    categoryIdsByVendor.set(vendorId, rows.map((r) => r.categoryId));
  }

  return { vendorIdsByCategory, categoryIdsByVendor, topCategoryByVendor };
}

/** The same links flattened for the server -> client props boundary.
 * The picker is a client component and gets plain objects rather than
 * Map/Set, which keeps the payload boring and obviously serializable. */
export interface VendorCategoryLinkProps {
  vendorIdsByCategory: Record<number, number[]>;
  categoryIdsByVendor: Record<number, number[]>;
  topCategoryByVendor: Record<number, number>;
}

export function serializeVendorCategoryLinks(links: VendorCategoryLinks): VendorCategoryLinkProps {
  const vendorIdsByCategory: Record<number, number[]> = {};
  for (const [categoryId, vendorIds] of links.vendorIdsByCategory) {
    vendorIdsByCategory[categoryId] = Array.from(vendorIds);
  }
  const categoryIdsByVendor: Record<number, number[]> = {};
  for (const [vendorId, categoryIds] of links.categoryIdsByVendor) {
    categoryIdsByVendor[vendorId] = categoryIds;
  }
  const topCategoryByVendor: Record<number, number> = {};
  for (const [vendorId, categoryId] of links.topCategoryByVendor) {
    topCategoryByVendor[vendorId] = categoryId;
  }
  return { vendorIdsByCategory, categoryIdsByVendor, topCategoryByVendor };
}
