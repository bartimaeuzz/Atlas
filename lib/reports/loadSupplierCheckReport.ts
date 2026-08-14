/**
 * Supplier Check report loader (2026-08-14) -- powers the "Supplier
 * Check" tab on /reports, follow-up ask: "build supplier tab on report
 * page so we can export file as xlsx for print payment check. using
 * export column like supplier check tab in dna excel." Re-opened the
 * real source file (" 2026 - C.xlsx", "Export" sheet) rather than
 * relying on a 2-day-old memory summary -- confirmed its columns are
 * Pay / Amount / Memo / PayeeName / PayeeAddress (address split across
 * 3 lines: street, city/state/zip, and an optional extra line), with
 * Memo holding the comma-joined invoice numbers a single check settled
 * (e.g. K.D. Market's "142675, 142676"). That's exactly the shape of
 * one `supplierCheckPayments` row here -- one row per check, joined to
 * its invoices for Memo and to the vendor for the payee/address fields.
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
  payeeAddressLine1: string | null;
  payeeAddressLine2: string | null;
  payeeAddressLine3: string | null;
}

export interface SupplierCheckReportData {
  rows: SupplierCheckReportRow[];
  totalAmount: number;
  checkCount: number;
}

export async function loadSupplierCheckReport(from: string, to: string): Promise<SupplierCheckReportData> {
  const payments = await db
    .select({
      paymentId: supplierCheckPayments.id,
      paidDate: supplierCheckPayments.paidDate,
      checkNumber: supplierCheckPayments.checkNumber,
      totalAmount: supplierCheckPayments.totalAmount,
      paidByName: employees.name,
      vendorName: ledgerVendors.name,
      payeeAddressLine1: ledgerVendors.payeeAddressLine1,
      payeeAddressLine2: ledgerVendors.payeeAddressLine2,
      payeeAddressLine3: ledgerVendors.payeeAddressLine3,
    })
    .from(supplierCheckPayments)
    .innerJoin(ledgerVendors, eq(supplierCheckPayments.vendorId, ledgerVendors.id))
    .innerJoin(employees, eq(supplierCheckPayments.paidByEmployeeId, employees.id))
    .where(and(gte(supplierCheckPayments.paidDate, from), lte(supplierCheckPayments.paidDate, to)))
    .orderBy(supplierCheckPayments.paidDate);

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
