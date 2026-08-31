/**
 * Builds the exportable .xlsx for Supplier Check checks. Two distinct
 * variants as of 2026-08-15 (Oliver): "check export file .xlsx dont
 * need any payee address status check number because this file will be
 * export to check printing software ... in another way it should be
 * different report that still show check number and status for
 * auditorial purposes."
 *
 *   - "print" -- used by /ledger/supplier-check/export (the instant/
 *     weekly-batch download triggered right after printing, meant to be
 *     fed straight into check-printing software). Trimmed to exactly
 *     what that software needs: Paid Date, Pay, Amount, Memo, PayeeName
 *     -- no PayeeAddress, no Status, no Check #, since those are either
 *     meaningless to check-printing software (Status is purely an Atlas
 *     lifecycle concept) or something the software assigns/looks up
 *     itself (Check #, and apparently the address too, per Oliver).
 *   - "audit" -- used by /reports/export-supplier-check (the date-range
 *     accounting export). Keeps the full original layout matching the
 *     real "Export" sheet in Soothr's " 2026 - C.xlsx" DNA file (Pay /
 *     Amount / Memo / PayeeName / PayeeAddress), PLUS Paid Date/Check #/
 *     Status for bookkeeping and auditor review -- this is the report
 *     Aey or an accountant would actually want to reconcile against.
 *
 * Deliberately did NOT build a column-picker UI for this -- the app
 * already had two separate, purpose-built export routes/buttons (one on
 * /ledger/supplier-check for printing, one on /reports for audit), so
 * giving each its own fixed, right-sized column set is simpler and more
 * foolproof than a configurable "choose your columns" control nobody
 * but Oliver would ever touch.
 */
import ExcelJS from "exceljs";
import type { SupplierCheckReportData } from "./loadSupplierCheckReport";

export type SupplierCheckWorkbookVariant = "print" | "audit";

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
  to: string,
  variant: SupplierCheckWorkbookVariant
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atlas";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Supplier Check");

  let r = 1;
  const title = from === to ? `Supplier Check — ${from}` : `Supplier Check — ${from} to ${to}`;
  sheet.getCell(r, 1).value = title;
  sheet.getCell(r, 1).font = { bold: true, size: 14 };
  r += 2;

  const headers =
    variant === "print"
      ? ["Paid Date", "Pay", "Amount", "Memo", "PayeeName"]
      : [
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
  const widths = variant === "print" ? [12, 26, 12, 22, 26] : [12, 10, 26, 12, 22, 26, 22, 22, 18, 10];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  const headerRow = sheet.getRow(r);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  r++;

  const amountCol = variant === "print" ? 3 : 4;

  for (const row of data.rows) {
    const excelRow = sheet.getRow(r);
    if (variant === "print") {
      excelRow.getCell(1).value = row.paidDate;
      excelRow.getCell(2).value = row.vendorName;
      moneyCell(excelRow, 3, row.totalAmount);
      excelRow.getCell(4).value = row.invoiceNumbers.join(", ");
      excelRow.getCell(5).value = row.vendorName;
    } else {
      excelRow.getCell(1).value = row.paidDate;
      excelRow.getCell(2).value = row.checkNumber ?? "";
      excelRow.getCell(3).value = row.vendorName;
      moneyCell(excelRow, 4, row.totalAmount);
      excelRow.getCell(5).value = row.invoiceNumbers.join(", ");
      excelRow.getCell(6).value = row.vendorName;
      excelRow.getCell(7).value = row.payeeAddressLine1 ?? "";
      excelRow.getCell(8).value = row.payeeAddressLine2 ?? "";
      excelRow.getCell(9).value = row.payeeAddressLine3 ?? "";
      excelRow.getCell(10).value = row.status === "closed" ? "Closed" : row.status === "void" ? "Void" : "Exported";
    }
    r++;
  }

  const totalsRow = sheet.getRow(r);
  totalsRow.getCell(amountCol - 1).value = "Total";
  totalsRow.font = { bold: true };
  moneyCell(totalsRow, amountCol, data.totalAmount);

  return wb.xlsx.writeBuffer();
}
