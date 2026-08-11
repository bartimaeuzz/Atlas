/**
 * Real-DB e2e verify for the sales-tax auto-fill/override feature
 * (2026-08-10), built after reviewing Oliver's real "MARCH 2026.xlsx"
 * monthly report. Run with: tsx verify_sales_tax.ts
 *
 * Checks:
 *  1. A shift with sales entered but no explicit sales tax yet shows an
 *     AUTO-SUGGESTED tax (totalSales × restaurantSettings.defaultSalesTaxRate)
 *     via loadClosingReportData, flagged salesTaxIsAuto=true.
 *  2. Same for each online platform's taxAmount.
 *  3. Once a manager explicitly saves a specific tax number (including a
 *     number that DIFFERS from the auto-suggestion, simulating "Toast's
 *     real number didn't match"), that exact number is what loads back,
 *     flagged salesTaxIsAuto=false — never silently overwritten by the
 *     suggestion again.
 */
import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { shifts, shiftSales, onlinePlatforms, onlinePlatformSalesRecords, restaurantSettings } from "./db/schema";
import { loadClosingReportData } from "./lib/shift/loadClosingReportData";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

async function main() {
  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  if (!settings) throw new Error("No restaurant settings row — did you run db:seed?");
  console.log(`Default sales tax rate: ${settings.defaultSalesTaxRate} (expect 0.08875)`);
  if (settings.defaultSalesTaxRate !== 0.08875) throw new Error("FAIL: seed didn't set the expected default rate");

  const [shift] = await db.select().from(shifts).limit(1);
  if (!shift) throw new Error("No shifts found — did you run db:seed?");

  const [sales] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shift.id));
  if (!sales) throw new Error("Picked shift has no shiftSales row");
  console.log(`\nShift ${shift.id} (${shift.date} ${shift.period}) — totalSales = ${sales.totalSales}`);

  // 1. Before any explicit tax entry — should auto-suggest.
  const before = await loadClosingReportData(shift.id);
  const expectedAuto = round2(sales.totalSales * settings.defaultSalesTaxRate);
  console.log(`\n[1] Before explicit entry:`);
  console.log(`    salesTax = ${before.sales?.salesTax} (expect ${expectedAuto})`);
  console.log(`    salesTaxIsAuto = ${before.sales?.salesTaxIsAuto} (expect true)`);
  if (before.sales?.salesTax !== expectedAuto) throw new Error("FAIL: auto-suggested tax doesn't match expected formula");
  if (before.sales?.salesTaxIsAuto !== true) throw new Error("FAIL: salesTaxIsAuto should be true before any explicit save");

  // Online platform check — pick the first one.
  const [platform] = await db.select().from(onlinePlatforms).limit(1);
  const [platformRecord] = await db
    .select()
    .from(onlinePlatformSalesRecords)
    .where(and(eq(onlinePlatformSalesRecords.shiftId, shift.id), eq(onlinePlatformSalesRecords.onlinePlatformId, platform.id)));
  if (platformRecord) {
    const platRow = before.platformSales.find((p) => p.platformId === platform.id)!;
    const expectedPlatAuto = round2(platformRecord.salesAmount * settings.defaultSalesTaxRate);
    console.log(`\n[2] Online platform (${platform.name}) before explicit entry:`);
    console.log(`    taxAmount = ${platRow.taxAmount} (expect ${expectedPlatAuto})`);
    console.log(`    taxAmountIsAuto = ${platRow.taxAmountIsAuto} (expect true)`);
    if (platRow.taxAmount !== expectedPlatAuto) throw new Error("FAIL: platform auto-suggested tax doesn't match expected formula");
    if (!platRow.taxAmountIsAuto) throw new Error("FAIL: platform taxAmountIsAuto should be true before any explicit save");
  }

  // 2. Simulate a manager explicitly saving a DIFFERENT number (Toast's
  // real figure didn't match the flat-rate suggestion) — directly via DB,
  // same as what upsertClosingReportSales would write.
  const explicitTax = round2(expectedAuto + 5.5); // deliberately different from the auto-suggestion
  await db.update(shiftSales).set({ salesTax: explicitTax }).where(eq(shiftSales.shiftId, shift.id));

  const after = await loadClosingReportData(shift.id);
  console.log(`\n[3] After explicit save (deliberately different number):`);
  console.log(`    salesTax = ${after.sales?.salesTax} (expect ${explicitTax})`);
  console.log(`    salesTaxIsAuto = ${after.sales?.salesTaxIsAuto} (expect false)`);
  if (after.sales?.salesTax !== explicitTax) throw new Error("FAIL: explicit tax value was not preserved");
  if (after.sales?.salesTaxIsAuto !== false) throw new Error("FAIL: salesTaxIsAuto should be false once explicitly saved");

  console.log("\n✅ All sales-tax auto-fill/override checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verify script failed:", err);
  process.exit(1);
});
