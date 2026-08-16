/**
 * Standalone, idempotent seed for the ledger_categories / ledger_vendors
 * / ledger_cards reference tables (2026-08-14, extended 2026-08-16 for
 * Card). Deliberately separate from db/seed.ts, which wipes and reseeds
 * EVERYTHING (shifts, schedule weeks, template assignments, all of it)
 * -- running the full seed against production would destroy every bit
 * of test data Oliver has built up. This script only touches these
 * three reference tables, and only inserts if they're currently empty,
 * so it's safe to run more than once (e.g. after re-running this same
 * zip's migration).
 *
 * Run with: npx tsx db/seedLedgerOnly.ts
 * (uses the same DATABASE_URL/DATABASE_AUTH_TOKEN already in your shell
 * env -- no different from running db:migrate.)
 */

import { db } from "./client";
import { ledgerCategories, ledgerVendors, ledgerCards } from "./schema";

async function main() {
  const existingCategories = await db.select().from(ledgerCategories);
  if (existingCategories.length === 0) {
    await db.insert(ledgerCategories).values(
      ["Bar", "Food", "Mis", "PAYROLL BOH", "PAYROLL FOH", "Fixed expenses", "Car", "SHM"].map((name) => ({ name }))
    );
    console.log("Inserted 8 ledger categories.");
  } else {
    console.log(`Skipped categories -- ${existingCategories.length} already exist.`);
  }

  const existingVendors = await db.select().from(ledgerVendors);
  if (existingVendors.length === 0) {
    await db.insert(ledgerVendors).values(
      [
        "NY Mutual Trading, Inc.",
        "Kyodo Beverage Co., Inc.",
        "The Haisein Company",
        "Wismettac Asian Foods, Inc.",
        "K.D. Market",
        "Asia Market Corporation",
        "Best Metropolitan Towel & Linen Supply",
        "J and J",
        "Jitto Group",
        "Sappesuk Limited",
        "East Sunshine Inc",
        "Auto-Chlor",
        "Standard Security",
        "OAK Beverage",
        "Sappe",
        "Gabriella Wines",
        "Gabriella Fine Wines",
        "Union Beer / Auto Tap",
        "Empire Merchants",
        "S.K.I. Beer Corp.",
        "Soilair (Bacchus Import)",
        "Southern Wine (SGWS)",
        "Baldor",
        "Skyfoods",
        "Bronx Freight and Fish",
        "True World Foods",
        "Amazon",
      ].map((name) =>
        name === "NY Mutual Trading, Inc."
          ? { name, payeeAddressLine1: "77 Metro Way", payeeAddressLine2: "Secaucus, NJ 07094" }
          : { name }
      )
    );
    console.log("Inserted 27 ledger vendors.");
  } else {
    console.log(`Skipped vendors -- ${existingVendors.length} already exist.`);
  }

  const existingCards = await db.select().from(ledgerCards);
  if (existingCards.length === 0) {
    await db.insert(ledgerCards).values([{ name: "House card (edit me)" }]);
    console.log("Inserted 1 placeholder ledger card -- rename/replace it with Youk Thai's real card(s) before going live.");
  } else {
    console.log(`Skipped cards -- ${existingCards.length} already exist.`);
  }

  console.log("Done. Edit/retire any of these freely from /ledger/vendors, /ledger/categories, and /ledger/cards in the app.");
}

main();
