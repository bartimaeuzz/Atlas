/**
 * Builds the payroll export .xlsx for one week (2026-08-17) — 3 sheets,
 * confirmed with Oliver before building:
 *
 *   1. "Check Export" — a plain Payee/Amount/Memo list, one row per
 *      employee, ready to feed straight into check-printing/payment
 *      software. Matches the shape of Soothr's real payroll DNA file's
 *      own Export/MyExport sheets (" 2026.xlsx").
 *   2. "Pay Stub Detail" — one block per employee (wage / extra /
 *      incentive / deduction / tip pool share / host upsell tip /
 *      total), meant to be printed and clipped to that employee's
 *      physical check as their pay stub.
 *   3. "Wage Acknowledgment" — a bilingual (English/Spanish) receipt
 *      each employee signs certifying they received the exact amount
 *      Atlas computed for them that week. Same wording style as the DNA
 *      file's own SIGN FORM sheet, with one deliberate omission: the DNA
 *      version also had employees certify they received specific meal
 *      breaks (a legal claim) — Atlas doesn't track breaks at all, so
 *      having someone sign a certification about something the system
 *      never observed would be putting a false record in writing. Left
 *      out; only the wage-received certification (which Atlas *can*
 *      back with real computed numbers) is included.
 */
import ExcelJS from "exceljs";
import type { PayrollRegister } from "./loadPayrollRegister";

const MONEY_FORMAT = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };

function moneyCell(row: ExcelJS.Row, col: number, value: number) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.numFmt = MONEY_FORMAT;
}

/** ISO "YYYY-MM-DD" -> "M/D/YYYY", matching the DNA file's own date
 * formatting in its Export sheet's Memo column. */
function usDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

export async function buildPayrollWorkbook(register: PayrollRegister): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atlas";
  wb.created = new Date();

  const memo = `${usDate(register.weekStartDate)} - ${usDate(register.weekEndDate)}`;

  /* ---------------------------------------------------------------- */
  /* Sheet 1 — Check Export                                            */
  /* ---------------------------------------------------------------- */
  const exportSheet = wb.addWorksheet("Check Export");
  exportSheet.getColumn(1).width = 28;
  exportSheet.getColumn(2).width = 12;
  exportSheet.getColumn(3).width = 22;

  let r = 1;
  exportSheet.getCell(r, 1).value = `Payroll — ${memo}`;
  exportSheet.getCell(r, 1).font = { bold: true, size: 14 };
  r += 2;

  const exportHeaderRow = exportSheet.getRow(r);
  ["Payee", "Amount", "Memo"].forEach((h, i) => {
    const cell = exportHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  r++;

  for (const row of register.rows) {
    const excelRow = exportSheet.getRow(r);
    excelRow.getCell(1).value = row.employeeName;
    moneyCell(excelRow, 2, row.totalCorePayout);
    excelRow.getCell(3).value = memo;
    r++;
  }
  const totalRow = exportSheet.getRow(r);
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true };
  moneyCell(totalRow, 2, register.total);
  totalRow.getCell(2).font = { bold: true };

  /* ---------------------------------------------------------------- */
  /* Sheet 2 — Pay Stub Detail                                         */
  /* ---------------------------------------------------------------- */
  const stubSheet = wb.addWorksheet("Pay Stub Detail");
  stubSheet.getColumn(1).width = 22;
  stubSheet.getColumn(2).width = 14;

  let s = 1;
  const detailLines: Array<{ label: string; key: keyof typeof register.rows[number] }> = [
    { label: "Wage", key: "flatWageAmount" },
    { label: "Extra pay", key: "extraPayAmount" },
    { label: "Incentive", key: "incentiveAmount" },
    { label: "Deduction", key: "deductionAmount" },
    { label: "Tip pool share", key: "tipPoolShare" },
    { label: "Host drink bonus", key: "hostUpsellTipShare" },
  ];

  for (const row of register.rows) {
    stubSheet.getCell(s, 1).value = row.employeeName;
    stubSheet.getCell(s, 1).font = { bold: true, size: 12 };
    s++;
    stubSheet.getCell(s, 1).value = `Pay period: ${memo}`;
    stubSheet.getCell(s, 1).font = { italic: true, color: { argb: "FF666666" } };
    s++;

    for (const line of detailLines) {
      const value = row[line.key] as number;
      if (line.key === "deductionAmount" && value === 0) continue; // no line if nothing was deducted
      const excelRow = stubSheet.getRow(s);
      excelRow.getCell(1).value = line.key === "deductionAmount" ? `${line.label} (subtracted)` : line.label;
      moneyCell(excelRow, 2, line.key === "deductionAmount" ? -value : value);
      s++;
    }
    const totalLine = stubSheet.getRow(s);
    totalLine.getCell(1).value = "Total paid";
    totalLine.getCell(1).font = { bold: true };
    moneyCell(totalLine, 2, row.totalCorePayout);
    totalLine.getCell(2).font = { bold: true };
    s += 2; // blank separator row before the next employee's stub
  }

  /* ---------------------------------------------------------------- */
  /* Sheet 3 — Wage Acknowledgment                                     */
  /* ---------------------------------------------------------------- */
  const ackSheet = wb.addWorksheet("Wage Acknowledgment");
  ackSheet.getColumn(1).width = 95;

  let a = 1;
  const weekEndingUs = usDate(register.weekEndDate);
  for (const row of register.rows) {
    ackSheet.getCell(a, 1).value = row.employeeName;
    ackSheet.getCell(a, 1).font = { bold: true, size: 12 };
    a++;
    ackSheet.getCell(a, 1).value =
      `I, ${row.employeeName}, hereby certify and agree that I received all the wages that I am due ` +
      `for the week ending ${weekEndingUs}, totaling $${row.totalCorePayout.toFixed(2)}.`;
    a++;
    ackSheet.getCell(a, 1).value =
      `[Yo, ${row.employeeName}, por la presente certifico y acepto que he recibido todos los salarios que se me deben ` +
      `para la semana que termina el ${weekEndingUs}, por un total de $${row.totalCorePayout.toFixed(2)}.]`;
    ackSheet.getCell(a, 1).font = { italic: true };
    a += 2;
    ackSheet.getCell(a, 1).value = "Employee signature: _______________________________     Date: ______________";
    a += 3; // blank separator rows before the next employee's acknowledgment
  }

  return wb.xlsx.writeBuffer();
}
