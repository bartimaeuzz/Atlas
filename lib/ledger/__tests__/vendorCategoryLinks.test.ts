import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LINK_MIN_USES,
  buildVendorCategoryLinks,
  serializeVendorCategoryLinks,
  type VendorCategoryUsage,
} from "../vendorCategoryLinks";

const use = (vendorId: number, categoryId: number, uses: number, lastUsedAt = "2026-08-01"): VendorCategoryUsage => ({
  vendorId,
  categoryId,
  uses,
  lastUsedAt,
});

test("no history at all links nothing", () => {
  const links = buildVendorCategoryLinks([]);
  assert.equal(links.vendorIdsByCategory.size, 0);
  assert.equal(links.topCategoryByVendor.size, 0);
});

test("a single use is a typo, not a link", () => {
  // The whole safety margin of the feature: one mis-picked category must
  // never teach the picker to hide the right vendor.
  const links = buildVendorCategoryLinks([use(1, 10, 1)]);
  assert.equal(links.vendorIdsByCategory.size, 0);
  assert.equal(links.topCategoryByVendor.get(1), undefined);
  assert.equal(LINK_MIN_USES, 2);
});

test("two uses is a link", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 2)]);
  assert.deepEqual(Array.from(links.vendorIdsByCategory.get(10) ?? []), [1]);
  assert.equal(links.topCategoryByVendor.get(1), 10);
});

test("the same pair from both sources adds up across the threshold", () => {
  // One petty cash entry plus one invoice is two uses of the same
  // relationship -- counting the sources separately would leave this
  // vendor unlinked forever.
  const links = buildVendorCategoryLinks([use(1, 10, 1, "2026-08-01"), use(1, 10, 1, "2026-08-09")]);
  assert.deepEqual(Array.from(links.vendorIdsByCategory.get(10) ?? []), [1]);
  assert.equal(links.topCategoryByVendor.get(1), 10);
});

test("a vendor can fall in several categories at once", () => {
  // Oliver's own caveat: "some vendors may fall in multiple categories."
  const links = buildVendorCategoryLinks([use(1, 10, 4), use(1, 20, 3), use(2, 20, 2)]);
  assert.deepEqual(Array.from(links.vendorIdsByCategory.get(10) ?? []), [1]);
  assert.deepEqual(Array.from(links.vendorIdsByCategory.get(20) ?? []).sort(), [1, 2]);
  // Both categories come back, best first -- the form offers them as
  // chips rather than picking one on the manager's behalf.
  assert.deepEqual(links.categoryIdsByVendor.get(1), [10, 20]);
  assert.equal(links.topCategoryByVendor.get(1), 10);
});

test("a vendor with one linked category is the only auto-fill case", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 5), use(1, 20, 1), use(2, 30, 2), use(2, 40, 2)]);
  // Vendor 1: the 20 pair is a single stray use, so only one real link
  // remains and the form may fill it in.
  assert.deepEqual(links.categoryIdsByVendor.get(1), [10]);
  // Vendor 2: two genuine links -- never pre-filled, offered instead.
  assert.equal(links.categoryIdsByVendor.get(2)?.length, 2);
});

test("the ranked list and the single best guess never disagree", () => {
  const links = buildVendorCategoryLinks([use(1, 30, 2, "2026-02-02"), use(1, 10, 4), use(1, 20, 2, "2026-08-30")]);
  assert.deepEqual(links.categoryIdsByVendor.get(1), [10, 20, 30]);
  assert.equal(links.topCategoryByVendor.get(1), links.categoryIdsByVendor.get(1)?.[0]);
});

test("a category below the threshold does not hold the vendor back elsewhere", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 3), use(1, 99, 1)]);
  assert.equal(links.vendorIdsByCategory.has(99), false);
  assert.equal(links.topCategoryByVendor.get(1), 10);
});

test("a tie on uses goes to the category used most recently", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 3, "2026-01-15"), use(1, 20, 3, "2026-08-30")]);
  assert.equal(links.topCategoryByVendor.get(1), 20);
});

test("a dead tie is stable regardless of row order", () => {
  const forward = buildVendorCategoryLinks([use(1, 20, 3, "2026-08-30"), use(1, 10, 3, "2026-08-30")]);
  const backward = buildVendorCategoryLinks([use(1, 10, 3, "2026-08-30"), use(1, 20, 3, "2026-08-30")]);
  assert.equal(forward.topCategoryByVendor.get(1), 10);
  assert.equal(backward.topCategoryByVendor.get(1), 10);
});

test("merging keeps the later date, whichever order the sources arrive in", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 1, "2026-08-30"), use(1, 10, 1, "2026-01-01"), use(1, 20, 2, "2026-08-02")]);
  // Both pairs sit at 2 uses, so the tie-break decides: pair (1,10) last
  // ran on 2026-08-30, which is later than (1,20)'s 2026-08-02.
  assert.equal(links.topCategoryByVendor.get(1), 10);
});

test("serializing keeps every link and drops the Maps", () => {
  const links = buildVendorCategoryLinks([use(1, 10, 4), use(1, 20, 3), use(2, 20, 2)]);
  const plain = serializeVendorCategoryLinks(links);
  assert.deepEqual(plain.vendorIdsByCategory[10], [1]);
  assert.deepEqual(plain.vendorIdsByCategory[20].sort(), [1, 2]);
  assert.deepEqual(plain.topCategoryByVendor, { 1: 10, 2: 20 });
  assert.deepEqual(plain.categoryIdsByVendor, { 1: [10, 20], 2: [20] });
  assert.deepEqual(JSON.parse(JSON.stringify(plain)), plain);
});
