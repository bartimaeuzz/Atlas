/**
 * Supplier Check report loader -- powers the "Supplier Check" tab on
 * /reports (a date-range accounting view) AND, as of 2026-08-14's
 * Printed/Paid restructure, the instant/weekly-batch .xlsx download
 * triggered straight from /ledger/supplier-check (loadSupplierCheckReportByIds,
 * an explicit-id variant of the same row shape rather than a date
 * range). Columns match the real DNA source file (" 2026 - C.xlsx",
 * "Export" sheet), confirmed by re-opening it directly: Pay / Amount /
 * Memo / PayeeName / PayeeAddress (address split across 3 lines), Memo
 * holding the comma-joined invoice numbers one check combined (e.g. K.D.
 * Market's real "142675, 142676"). `status` (Printed/Paid) added
 * 2026-08-14 after Oliver's conversation with Aey clarified checks get
 * printed/exported first, then marked paid once delivered.
 */

import { and, gte, lte, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierCheckPayments, supplierInvoices, ledgerVendors, employees } from "@/db/schema";

export interface SupplierCheckReportRow {
  paymentId: number;
  paidDate: string;
  checkNumber: string | null;
  vendorName: string;
  totalAmount: number;
  invoiceNumbers: string[];
  paidByName: string;
  status: "printed" | "paid";
  payeeAddressLine1: string | null;
  payeeAddressLine2: string | null;
  payeeAddressLine3: string | null;
}

export interface SupplierCheckReportData {
  rows: SupplierCheckReportRow[];
  totalAmount: number;
  checkCount: number;
}

type RawPaymentRow = Omit<SupplierCheckReportRow, "invoiceNumbers">;

/** Shared "attach which invoice numbers each check combined" step, used
 * by both the date-range loader and the by-id loader below -- avoids
 * querying supplierInvoices twice with slightly different logic. */
async function attachInvoiceNumbers(payments: RawPaymentRow[]): Promise<SupplierCheckReportData> {
  if (payments.length === 0) {
    return { rows: [], totalAmount: 0, checkCount: 0 };
  }

  const paymentIds = payments.map((p) => p.paymentId);
  const invoiceRows = await db
    .select({ paymentId: supplierInvoices.paymentId, invoiceNumber: supplierInvoices.invoiceNumber })
    .from(supplierInvoices)
    .where(inArray(supplierInvoices.paymentId, paymentIds));

  const invoiceNumbersByPaymentId = new Map<number, string[]>();
  for (const r of invoiceRows) {
    if (r.paymentId == null) continue;
    const list = invoiceNumbersByPaymentId.get(r.paymentId) ?? [];
    list.push(r.invoiceNumber);
    invoiceNumbersByPaymentId.set(r.paymentId, list);
  }

  const rows: SupplierCheckReportRow[] = payments.map((p) => ({
    ...p,
    invoiceNumbers: invoiceNumbersByPaymentId.get(p.paymentId) ?? [],
  }));

  return {
    rows,
    totalAmount: rows.reduce((sum, r) => sum + r.totalAmount, 0),
    checkCount: rows.length,
  };
}

function selectPaymentRows() {
  return db
    .select({
      paymentId: supplierCheckPayments.id,
      paidDate: supplierCheckPayments.paidDate,
      checkNumber: supplierCheckPayments.checkNumber,
      totalAmount: supplierCheckPayments.totalAmount,
      paidByName: employees.nickname,
      status: supplierCheckPayments.status,
      vendorName: ledgerVendors.name,
      payeeAddressLine1: ledgerVendors.payeeAddressLine1,
      payeeAddressLine2: ledgerVendors.payeeAddressLine2,
      payeeAddressLine3: ledgerVendors.payeeAddressLine3,
    })
    .from(supplierCheckPayments)
    .innerJoin(ledgerVendors, eq(supplierCheckPayments.vendorId, ledgerVendors.id))
    .innerJoin(employees, eq(supplierCheckPayments.paidByEmployeeId, employees.id));
}

export async function loadSupplierCheckReport(from: string, to: string): Promise<SupplierCheckReportData> {
  const payments = await selectPaymentRows()
    .where(and(gte(supplierCheckPayments.paidDate, from), lte(supplierCheckPayments.paidDate, to)))
    .orderBy(supplierCheckPayments.paidDate);

  return attachInvoiceNumbers(payments as RawPaymentRow[]);
}

/** Explicit-id variant -- powers the instant/weekly-batch .xlsx download
 * triggered right after printSupplierCheck/printAllPendingChecks runs,
 * where the caller already knows exactly which payment ids were just
 * created and wants a printable check sheet for precisely those, not a
 * date range (today could have other, unrelated checks on it too). */
export async function loadSupplierCheckReportByIds(paymentIds: number[]): Promise<SupplierCheckReportData> {
  if (paymentIds.length === 0) {
    return { rows: [], totalAmount: 0, checkCount: 0 };
  }
  const payments = await selectPaymentRows().where(inArray(supplierCheckPayments.id, paymentIds));
  return attachInvoiceNumbers(payments as RawPaymentRow[]);
}
