/**
 * Builds the exportable .xlsx for the sales/tax report (2026-08-10),
 * laid out to match the structure of Oliver's real "MARCH 2026.xlsx" (a
 * Toast section, then one section per online platform, then online
 * totals) — familiar to Aey/the accountant, but with CORRECTED column
 * labels (CC Sales / Total Credit — see loadSalesTaxReport.ts's header
 * comment for the column-swap finding in the original file).
 *
 * Deliberate simplification vs. the original file: every platform gets the
 * same 4 columns (Net/Tax/Tips/Total) — the original was inconsistent
 * (Uber had no Tips column at all), but Atlas tracks tips uniformly across
 * every platform via the same two fields, so there's no reason to omit it
 * for one platform here.
 */
import ExcelJS from "exceljs";
import type { SalesTaxReportData } from "./loadSalesTaxReport";

const MONEY_FORMAT = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };

function moneyCell(row: ExcelJS.Row, col: number, value: number) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.numFmt = MONEY_FORMAT;
}

export async function buildSalesTaxWorkbook(data: SalesTaxReportData): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mohom";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Sales & Tax");
  sheet.getColumn(1).width = 12;
  for (let c = 2; c <= 20; c++) sheet.getColumn(c).width = 13;

  let r = 1;
  sheet.getCell(r, 1).value = `Sales & Tax Report — ${data.dateFrom} to ${data.dateTo}`;
  sheet.getCell(r, 1).font = { bold: true, size: 14 };
  r += 2;

  // --- Toast section ---
  const toastHeaderRow1 = sheet.getRow(r);
  toastHeaderRow1.getCell(1).value = "TOAST";
  const toastHeaders = ["Date", "Net Sale", "Tax", "Total Sale", "", "Cash", "CC Sales", "CC Tips", "Total Credit"];
  const toastHeaderRow2 = sheet.getRow(r + 1);
  toastHeaders.forEach((h, i) => {
    const cell = toastHeaderRow2.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  r += 2;

  for (const day of data.toastDays) {
    const row = sheet.getRow(r);
    row.getCell(1).value = day.date;
    moneyCell(row, 2, day.netSale);
    moneyCell(row, 3, day.tax);
    moneyCell(row, 4, day.totalSale);
    moneyCell(row, 6, day.cash);
    moneyCell(row, 7, day.ccSalesOnly);
    moneyCell(row, 8, day.ccTips);
    moneyCell(row, 9, day.totalCredit);
    r++;
  }
  const toastTotalsRow = sheet.getRow(r);
  toastTotalsRow.font = { bold: true };
  moneyCell(toastTotalsRow, 2, data.toastTotals.netSale);
  moneyCell(toastTotalsRow, 3, data.toastTotals.tax);
  moneyCell(toastTotalsRow, 4, data.toastTotals.totalSale);
  moneyCell(toastTotalsRow, 6, data.toastTotals.cash);
  moneyCell(toastTotalsRow, 7, data.toastTotals.ccSalesOnly);
  moneyCell(toastTotalsRow, 8, data.toastTotals.ccTips);
  moneyCell(toastTotalsRow, 9, data.toastTotals.totalCredit);
  r += 3;

  // --- Online platforms section — one 4-column block per platform, side by side ---
  const platformStartCol = new Map<number, number>();
  let col = 2;
  data.platformNames.forEach((p) => {
    platformStartCol.set(p.platformId, col);
    col += 5; // 4 data columns + 1 gap
  });

  const platHeaderRow1 = sheet.getRow(r);
  platHeaderRow1.getCell(1).value = "Date";
  data.platformNames.forEach((p) => {
    const startCol = platformStartCol.get(p.platformId)!;
    const cell = platHeaderRow1.getCell(startCol);
    cell.value = p.platformName;
    cell.font = { bold: true };
  });
  const platHeaderRow2 = sheet.getRow(r + 1);
  data.platformNames.forEach((p) => {
    const startCol = platformStartCol.get(p.platformId)!;
    ["Net", "Tax", "Tips", "Total"].forEach((h, i) => {
      const cell = platHeaderRow2.getCell(startCol + i);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    });
  });
  r += 2;

  const platformDaysByDate = new Map<string, typeof data.platformDays>();
  for (const row of data.platformDays) {
    const list = platformDaysByDate.get(row.date) ?? [];
    list.push(row);
    platformDaysByDate.set(row.date, list);
  }
  const allDates = Array.from(new Set(data.platformDays.map((d) => d.date))).sort();

  for (const date of allDates) {
    const row = sheet.getRow(r);
    row.getCell(1).value = date;
    const rowsForDate = platformDaysByDate.get(date) ?? [];
    for (const pd of rowsForDate) {
      const startCol = platformStartCol.get(pd.platformId)!;
      moneyCell(row, startCol, pd.net);
      moneyCell(row, startCol + 1, pd.tax);
      moneyCell(row, startCol + 2, pd.tips);
      moneyCell(row, startCol + 3, pd.total);
    }
    r++;
  }
  const platTotalsRow = sheet.getRow(r);
  platTotalsRow.font = { bold: true };
  data.platformTotals.forEach((p) => {
    const startCol = platformStartCol.get(p.platformId)!;
    moneyCell(platTotalsRow, startCol, p.net);
    moneyCell(platTotalsRow, startCol + 1, p.tax);
    moneyCell(platTotalsRow, startCol + 2, p.tips);
    moneyCell(platTotalsRow, startCol + 3, p.total);
  });
  r += 2;

  sheet.getCell(r, 1).value = "TOTAL ONLINE SALE";
  sheet.getCell(r, 1).font = { bold: true };
  moneyCell(sheet.getRow(r), 2, data.onlineTotals.net);
  r++;
  sheet.getCell(r, 1).value = "TOTAL ONLINE SALE TAX";
  sheet.getCell(r, 1).font = { bold: true };
  moneyCell(sheet.getRow(r), 2, data.onlineTotals.tax);

  return wb.xlsx.writeBuffer();
}
