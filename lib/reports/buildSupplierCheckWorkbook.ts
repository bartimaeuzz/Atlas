/**
 * Builds the exportable .xlsx for Supplier Check checks -- columns
 * matching the real "Export" sheet in Soothr's " 2026 - C.xlsx" DNA
 * file (Pay / Amount / Memo / PayeeName / PayeeAddress lines), confirmed
 * by re-opening that sheet directly rather than assuming from memory.
 * Two columns are added ahead of the DNA layout (Paid Date, Check #)
 * for an audit trail the original pre-check DNA sheet didn't need, and
 * a Status column (2026-08-14, Printed/Paid) reflecting the check
 * lifecycle added after Oliver's conversation with Aey. Used both by
 * the date-range /reports export and the instant/weekly-batch export
 * triggered right from /ledger/supplier-check (see
 * loadSupplierCheckReportByIds) -- same workbook shape either way.
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
  const widths = [12, 10, 26, 12, 22, 26, 22, 22, 18, 10];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  let r = 1;
  const title = from === to ? `Supplier Check — ${from}` : `Supplier Check — ${from} to ${to}`;
  sheet.getCell(r, 1).value = title;
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
    "Status",
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
    excelRow.getCell(10).value = row.status === "paid" ? "Paid" : "Printed";
    r++;
  }

  const totalsRow = sheet.getRow(r);
  totalsRow.getCell(3).value = "Total";
  totalsRow.font = { bold: true };
  moneyCell(totalsRow, 4, data.totalAmount);

  return wb.xlsx.writeBuffer();
}
