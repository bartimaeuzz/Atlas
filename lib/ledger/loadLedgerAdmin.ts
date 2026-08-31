import { db } from "@/db/client";
import { ledgerVendors, ledgerVendorTags, ledgerCategories } from "@/db/schema";

export async function loadLedgerVendors() {
  return db.select().from(ledgerVendors).orderBy(ledgerVendors.name);
}

/** Vendors with their tags joined in (2026-08-31, Aey's vendor-tag
 * filter) — the shape the tag-filtering VendorPicker wants. */
export async function loadLedgerVendorsWithTags(): Promise<{ id: number; name: string; active: boolean; tags: string[] }[]> {
  const [vendors, tagRows] = await Promise.all([
    db.select().from(ledgerVendors).orderBy(ledgerVendors.name),
    db.select().from(ledgerVendorTags),
  ]);
  const tagsByVendor = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByVendor.get(t.vendorId) ?? [];
    list.push(t.tag);
    tagsByVendor.set(t.vendorId, list);
  }
  return vendors.map((v) => ({ id: v.id, name: v.name, active: v.active, tags: (tagsByVendor.get(v.id) ?? []).sort() }));
}

/** Every distinct tag in use, for the vendor form\'s reuse hint —
 * offering existing spellings is what keeps "Bar" from fragmenting
 * into "bar", "Bar stuff", "BAR". */
export async function loadAllVendorTags(): Promise<string[]> {
  const rows = await db.select().from(ledgerVendorTags);
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = r.tag.toLowerCase();
    if (!seen.has(key)) seen.set(key, r.tag);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export async function loadLedgerCategories() {
  return db.select().from(ledgerCategories).orderBy(ledgerCategories.name);
}
