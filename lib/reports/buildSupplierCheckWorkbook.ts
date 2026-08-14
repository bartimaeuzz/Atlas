/**
 * Builds the exportable .xlsx for the Supplier Check report (2026-08-14),
 * columns matching the real "Export" sheet in Soothr's " 2026 - C.xlsx"
 * DNA file (Pay / Amount / Memo / PayeeName / PayeeAddress lines) --
 * confirmed by re-opening that sheet directly rather than assuming from
 * memory. Two columns are added ahead of the DNA layout (Paid Date,
 * Check #) since Atlas's version logs the payment after the fact rather
 * than generating a pre-check batch sheet -- those weren't in the
 * original DNA export (which was assembled right before printing checks,
 * with no historical date/check-number columns needed yet), but are
 * useful here for an audit trail across a date range. Printable directly
 * or importable into check-writing/accounting software the same way the
 * Sales & Tax export is.
 */
import ExcelJS from "exceljs";
import type { SupplierCheckReportData } from "./loadSupplierCheckReport";

const MONEY_FORMAT = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };

function moneyCell(row: ExcelJS.Row, col: number, value: number) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.numFmt = MONEY_FORMAT;
}

export async function buildSupplierCheckWorkbook(
  data: SupplierCheckReportData,
  from: string,
  to: string
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atlas";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Supplier Check");
  const widths = [12, 10, 26, 12, 22, 26, 22, 22, 18];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  let r = 1;
  sheet.getCell(r, 1).value = `Supplier Check — ${from} to ${to}`;
  sheet.getCell(r, 1).font = { bold: true, size: 14 };
  r += 2;

  const headers = [
    "Paid Date",
    "Check #",
    "Pay",
    "Amount",
    "Memo",
    "PayeeName",
    "PayeeAddressLine1",
    "PayeeAddressLine2",
    "PayeeAddressLine3",
  ];
  const headerRow = sheet.getRow(r);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  r++;

  for (const row of data.rows) {
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = row.paidDate;
    excelRow.getCell(2).value = row.checkNumber ?? "";
    excelRow.getCell(3).value = row.vendorName;
    moneyCell(excelRow, 4, row.totalAmount);
    excelRow.getCell(5).value = row.invoiceNumbers.join(", ");
    excelRow.getCell(6).value = row.vendorName;
    excelRow.getCell(7).value = row.payeeAddressLine1 ?? "";
    excelRow.getCell(8).value = row.payeeAddressLine2 ?? "";
    excelRow.getCell(9).value = row.payeeAddressLine3 ?? "";
    r++;
  }

  const totalsRow = sheet.getRow(r);
  totalsRow.getCell(3).value = "Total";
  totalsRow.font = { bold: true };
  moneyCell(totalsRow, 4, data.totalAmount);

  return wb.xlsx.writeBuffer();
}
