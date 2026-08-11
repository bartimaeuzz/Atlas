/**
 * Real-DB e2e verify for the sales/tax export report (2026-08-10). Run
 * with: tsx verify_sales_tax_report.ts (against the real seeded DB, which
 * has 14 finalized shifts across 2026-08-03..2026-08-09).
 *
 * Checks:
 *  1. loadSalesTaxReport rolls up 7 distinct days from the 14 shifts
 *     (Lunch+Dinner combined per date, matching how Toast reports daily).
 *  2. Toast totals reconcile: netSale + tax = totalSale, ccSalesOnly +
 *     ccTips = totalCredit, and the daily rows sum to the totals row.
 *  3. Online platform totals sum correctly across days.
 *  4. buildSalesTaxWorkbook produces a real, non-trivial .xlsx buffer
 *     (written to disk so it can be spot-checked).
 */
import { loadSalesTaxReport } from "./lib/reports/loadSalesTaxReport";
import { buildSalesTaxWorkbook } from "./lib/reports/buildSalesTaxWorkbook";
import fs from "node:fs";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

async function main() {
  const data = await loadSalesTaxReport("2026-08-01", "2026-08-31");

  console.log(`Toast days: ${data.toastDays.length} (expect 7 — 2026-08-03 through 2026-08-09)`);
  if (data.toastDays.length !== 7) throw new Error("FAIL: expected 7 distinct days from 14 lunch+dinner shifts");

  console.log("\n[1] Per-day reconciliation:");
  for (const d of data.toastDays) {
    const totalSaleOk = round2(d.netSale + d.tax) === d.totalSale;
    const totalCreditOk = round2(d.ccSalesOnly + d.ccTips) === d.totalCredit;
    console.log(
      `    ${d.date}: net=${d.netSale} tax=${d.tax} totalSale=${d.totalSale} (${totalSaleOk ? "OK" : "MISMATCH"})` +
        ` | ccSales=${d.ccSalesOnly} ccTips=${d.ccTips} totalCredit=${d.totalCredit} (${totalCreditOk ? "OK" : "MISMATCH"})`
    );
    if (!totalSaleOk) throw new Error(`FAIL: ${d.date} totalSale doesn't reconcile`);
    if (!totalCreditOk) throw new Error(`FAIL: ${d.date} totalCredit doesn't reconcile`);
  }

  console.log("\n[2] Daily rows sum to totals row:");
  const sumNet = round2(data.toastDays.reduce((a, d) => a + d.netSale, 0));
  const sumTax = round2(data.toastDays.reduce((a, d) => a + d.tax, 0));
  console.log(`    sum(netSale)=${sumNet} vs totals.netSale=${data.toastTotals.netSale}`);
  console.log(`    sum(tax)=${sumTax} vs totals.tax=${data.toastTotals.tax}`);
  if (sumNet !== data.toastTotals.netSale) throw new Error("FAIL: netSale totals don't match daily sum");
  if (sumTax !== data.toastTotals.tax) throw new Error("FAIL: tax totals don't match daily sum");

  console.log("\n[3] Online platform totals:");
  for (const p of data.platformTotals) {
    console.log(`    ${p.platformName}: net=${p.net} tax=${p.tax} tips=${p.tips} total=${p.total}`);
  }
  console.log(`    Combined onlineTotals: net=${data.onlineTotals.net} tax=${data.onlineTotals.tax}`);
  const sumPlatformNet = round2(data.platformTotals.reduce((a, p) => a + p.net, 0));
  if (sumPlatformNet !== data.onlineTotals.net) throw new Error("FAIL: online totals don't match per-platform sum");

  console.log("\n[4] Building .xlsx...");
  const buffer = await buildSalesTaxWorkbook(data);
  const bytes = Buffer.from(buffer);
  console.log(`    Buffer size: ${bytes.length} bytes`);
  if (bytes.length < 1000) throw new Error("FAIL: workbook buffer suspiciously small");
  fs.writeFileSync("/tmp/verify_sales_tax_report_output.xlsx", bytes);
  console.log("    Wrote /tmp/verify_sales_tax_report_output.xlsx");

  console.log("\n✅ All sales/tax report checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verify script failed:", err);
  process.exit(1);
});
