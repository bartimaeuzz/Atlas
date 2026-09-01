/** Database side of the learned vendor <-> category links -- see
 * vendorCategoryLinks.ts for what they are and why the counting lives in
 * a separate pure module.
 *
 * Both queries aggregate in SQL rather than reading rows into JS. Petty
 * cash entries and supplier invoices both grow forever; the aggregate
 * does not (it is capped at vendors x categories, a few dozen rows for a
 * real restaurant).
 */

import { count, isNotNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { pettyCashEntries, supplierInvoices } from "@/db/schema";
import {
  buildVendorCategoryLinks,
  type VendorCategoryLinks,
  type VendorCategoryUsage,
} from "./vendorCategoryLinks";

export async function loadVendorCategoryLinks(): Promise<VendorCategoryLinks> {
  const [pettyCashUse, invoiceUse] = await Promise.all([
    db
      .select({
        vendorId: pettyCashEntries.vendorId,
        categoryId: pettyCashEntries.categoryId,
        uses: count(),
        lastUsedAt: max(pettyCashEntries.date),
      })
      .from(pettyCashEntries)
      // Petty cash allows "No vendor"; those rows say nothing about any
      // vendor's categories.
      .where(isNotNull(pettyCashEntries.vendorId))
      .groupBy(pettyCashEntries.vendorId, pettyCashEntries.categoryId),
    db
      .select({
        vendorId: supplierInvoices.vendorId,
        categoryId: supplierInvoices.categoryId,
        uses: count(),
        lastUsedAt: max(supplierInvoices.receivedDate),
      })
      .from(supplierInvoices)
      .groupBy(supplierInvoices.vendorId, supplierInvoices.categoryId),
  ]);

  const rows: VendorCategoryUsage[] = [];
  for (const row of [...pettyCashUse, ...invoiceUse]) {
    // vendorId is nullable on petty cash and max() is nullable to the
    // type system; neither can actually be null in a grouped row that
    // survived the where-clause, but narrowing beats asserting.
    if (row.vendorId === null || row.lastUsedAt === null) continue;
    rows.push({
      vendorId: row.vendorId,
      categoryId: row.categoryId,
      uses: row.uses,
      lastUsedAt: row.lastUsedAt,
    });
  }

  return buildVendorCategoryLinks(rows);
}
