/**
 * Loaders for Supplier Check (2026-08-14, extended 2026-08-14 after
 * Oliver's real-workflow conversation with Aey) -- invoice-based vendor
 * payments, distinct from Petty Cash's cash-on-delivery entries. Three-
 * stage lifecycle: an invoice is logged PENDING when a delivery arrives,
 * a check is PRINTED for a vendor (always combining every pending
 * invoice for that vendor -- see lib/actions/supplierCheck.ts's
 * printSupplierCheck), then marked PAID once actually delivered.
 */

import { eq, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { supplierInvoices, supplierCheckPayments, ledgerVendors, ledgerCategories, employees } from "@/db/schema";

const deliveredByEmployee = alias(employees, "delivered_by_employee");

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

/** Every unpaid invoice, grouped by vendor -- feeds the "Not yet
 * checked" section on /ledger/supplier-check, where a manager can print
 * a check for that vendor's whole group at once. */
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

export interface SupplierCheckView {
  id: number;
  vendorId: number;
  vendorName: string;
  checkDate: string;
  checkNumber: string | null;
  totalAmount: number;
  printedByName: string;
  status: "printed" | "paid";
  deliveredAt: string | null;
  deliveredByName: string | null;
  invoices: PaymentInvoiceDetail[];
}

/** Every check ever printed, most recent first -- the holistic table on
 * /ledger/supplier-check (2026-08-14 restructure). Each row shows its
 * status (Printed/Paid) and expands to show which invoices it combined.
 * Replaces v46's loadRecentSupplierPayments, which only covered PAID
 * payments and had no status concept. */
export async function loadSupplierChecks(limit = 200): Promise<SupplierCheckView[]> {
  const payments = await db
    .select({
      id: supplierCheckPayments.id,
      vendorId: supplierCheckPayments.vendorId,
      vendorName: ledgerVendors.name,
      checkDate: supplierCheckPayments.paidDate,
      checkNumber: supplierCheckPayments.checkNumber,
      totalAmount: supplierCheckPayments.totalAmount,
      printedByName: employees.name,
      status: supplierCheckPayments.status,
      deliveredAt: supplierCheckPayments.deliveredAt,
      deliveredByName: deliveredByEmployee.name,
    })
    .from(supplierCheckPayments)
    .innerJoin(ledgerVendors, eq(supplierCheckPayments.vendorId, ledgerVendors.id))
    .innerJoin(employees, eq(supplierCheckPayments.paidByEmployeeId, employees.id))
    .leftJoin(deliveredByEmployee, eq(supplierCheckPayments.deliveredByEmployeeId, deliveredByEmployee.id))
    .orderBy(desc(supplierCheckPayments.paidDate), desc(supplierCheckPayments.id))
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

  return payments.map((p) => ({
    ...p,
    status: p.status as "printed" | "paid",
    invoices: invoicesByPaymentId.get(p.id) ?? [],
  }));
}
