import { db } from "@/db/client";
import { ledgerVendors, ledgerCategories } from "@/db/schema";

export async function loadLedgerVendors() {
  return db.select().from(ledgerVendors).orderBy(ledgerVendors.name);
}

export async function loadLedgerCategories() {
  return db.select().from(ledgerCategories).orderBy(ledgerCategories.name);
}
