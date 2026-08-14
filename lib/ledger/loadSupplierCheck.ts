/**
 * Loaders for Supplier Check (2026-08-14) -- invoice-based vendor
 * payments, distinct from Petty Cash's cash-on-delivery entries. See
 * project_atlas_ledger memory for the full design conversation: an
 * invoice is logged PENDING when a delivery arrives, then a manager
 * marks one or more pending invoices from the SAME vendor as paid
 * together under one check (lib/actions/supplierCheck.ts's
 * recordSupplierPayment).
 */

import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, supplierCheckPayments, ledgerVendors, ledgerCategories, employees } from "@/db/schema";

export interface PendingInvoiceView {
  id: number;
  receivedDate: string;
  invoiceNumber: string;
  categoryName: string;
  description: string | null;
  amount: number;
  createdByName: string;
}

export interface VendorPendingGroup {
  vendorId: number;
  vendorName: string;
  invoices: PendingInvoiceView[];
  totalPending: number;
}

/** Every unpaid invoice, grouped by vendor -- the shape the "mark paid"
 * page needs, since a payment can only settle invoices from ONE vendor
 * at a time (confirmed with Oliver: "printed payment check can
 * reconcile into one check for each supplier"). */
export async function loadPendingInvoicesByVendor(): Promise<VendorPendingGroup[]> {
  const rows = await db
    .select({
      id: supplierInvoices.id,
      receivedDate: supplierInvoices.receivedDate,
      invoiceNumber: supplierInvoices.invoiceNumber,
      categoryName: ledgerCategories.name,
      description: supplierInvoices.description,
      amount: supplierInvoices.amount,
      createdByName: employees.name,
      vendorId: ledgerVendors.id,
      vendorName: ledgerVendors.name,
    })
    .from(supplierInvoices)
    .innerJoin(ledgerVendors, eq(supplierInvoices.vendorId, ledgerVendors.id))
    .innerJoin(ledgerCategories, eq(supplierInvoices.categoryId, ledgerCategories.id))
    .innerJoin(employees, eq(supplierInvoices.createdByEmployeeId, employees.id))
    .where(eq(supplierInvoices.status, "pending"))
    .orderBy(supplierInvoices.receivedDate);

  const byVendor = new Map<number, VendorPendingGroup>();
  for (const r of rows) {
    let group = byVendor.get(r.vendorId);
    if (!group) {
      group = { vendorId: r.vendorId, vendorName: r.vendorName, invoices: [], totalPending: 0 };
      byVendor.set(r.vendorId, group);
    }
    group.invoices.push({
      id: r.id,
      receivedDate: r.receivedDate,
      invoiceNumber: r.invoiceNumber,
      categoryName: r.categoryName,
      description: r.description,
      amount: r.amount,
      createdByName: r.createdByName,
    });
    group.totalPending += r.amount;
  }

  return Array.from(byVendor.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

export interface PaymentInvoiceDetail {
  id: number;
  invoiceNumber: string;
  categoryName: string;
  description: string | null;
  amount: number;
  receivedDate: string;
}

export interface PaymentHistoryView {
  id: number;
  vendorName: string;
  paidDate: string;
  checkNumber: string | null;
  totalAmount: number;
  paidByName: string;
  /** Full line-item detail for each invoice this check settled -- powers
   * the click-to-expand detail view on /ledger/supplier-check (2026-08-14
   * follow-up ask). Kept as objects rather than just invoice numbers so
   * the detail view can show category/description/amount per line
   * without a second round trip. */
  invoices: PaymentInvoiceDetail[];
}

/** Most recent payments first, each with full invoice line-item detail
 * for the expandable "view detail" row on the Supplier Check page. */
export async function loadRecentSupplierPayments(limit = 30): Promise<PaymentHistoryView[]> {
  const payments = await db
    .select({
      id: supplierCheckPayments.id,
      vendorName: ledgerVendors.name,
      paidDate: supplierCheckPayments.paidDate,
      checkNumber: supplierCheckPayments.checkNumber,
      totalAmount: supplierCheckPayments.totalAmount,
      paidByName: employees.name,
    })
    .from(supplierCheckPayments)
    .innerJoin(ledgerVendors, eq(supplierCheckPayments.vendorId, ledgerVendors.id))
    .innerJoin(employees, eq(supplierCheckPayments.paidByEmployeeId, employees.id))
    .orderBy(desc(supplierCheckPayments.paidDate))
    .limit(limit);

  if (payments.length === 0) return [];

  const paymentIds = payments.map((p) => p.id);
  const invoiceRows = await db
    .select({
      paymentId: supplierInvoices.paymentId,
      id: supplierInvoices.id,
      invoiceNumber: supplierInvoices.invoiceNumber,
      categoryName: ledgerCategories.name,
      description: supplierInvoices.description,
      amount: supplierInvoices.amount,
      receivedDate: supplierInvoices.receivedDate,
    })
    .from(supplierInvoices)
    .innerJoin(ledgerCategories, eq(supplierInvoices.categoryId, ledgerCategories.id))
    .where(inArray(supplierInvoices.paymentId, paymentIds));

  const invoicesByPaymentId = new Map<number, PaymentInvoiceDetail[]>();
  for (const r of invoiceRows) {
    if (r.paymentId == null) continue;
    const list = invoicesByPaymentId.get(r.paymentId) ?? [];
    list.push({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      categoryName: r.categoryName,
      description: r.description,
      amount: r.amount,
      receivedDate: r.receivedDate,
    });
    invoicesByPaymentId.set(r.paymentId, list);
  }

  return payments.map((p) => ({ ...p, invoices: invoicesByPaymentId.get(p.id) ?? [] }));
}
