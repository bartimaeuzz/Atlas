/**
 * Loaders for Supplier Check (2026-08-14, extended 2026-08-14 after
 * Oliver's real-workflow conversation with Aey) -- invoice-based vendor
 * payments, distinct from Petty Cash's cash-on-delivery entries. Three-
 * stage lifecycle: an invoice is logged PENDING when a delivery arrives,
 * a check is PRINTED for a vendor (always combining every pending
 * invoice for that vendor -- see lib/actions/supplierCheck.ts's
 * printSupplierCheck), then marked PAID once actually delivered.
 */

import { eq, desc, inArray, and, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import {
  supplierInvoices,
  supplierCheckPayments,
  ledgerVendors,
  ledgerCategories,
  employees,
  supplierCheckAuditLog,
} from "@/db/schema";

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

/** One entry in a check's audit trail (2026-08-15, Oliver: "as it
 * concern money it should have a log who do what when with the check
 * and why edit print check"). `details` shape depends on `action` --
 * see supplierCheckAuditLog's schema comment for both shapes. */
export interface CheckAuditLogEntry {
  id: number;
  action: "EDITED_INVOICE" | "PRINTED_CHECK";
  performedByName: string;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
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
  /** Print event + any post-print edits, most recent first. Pre-print
   * edits to a still-Pending invoice are logged too (see
   * editSupplierInvoice) but not surfaced here yet -- scoped to
   * "history of this committed check" for now. */
  auditLog: CheckAuditLogEntry[];
}

/** Every check printed in a given date range (by paidDate), most recent
 * first -- feeds the holistic table on /ledger/supplier-check, which
 * (2026-08-16) got a Week/Month picker so Oliver can browse checks the
 * same way the Petty Cash tab lets him browse days: "supplier tab on
 * ledger should be able to show by week or month." Replaces the old
 * flat "most recent 200, no scoping" behavior -- range is now required
 * so a period is always well-defined and the "Checks" total is
 * meaningful. Pass a wide range (e.g. this vendor's whole history) if
 * an unscoped list is ever needed again. */
export async function loadSupplierChecks({ from, to }: { from: string; to: string }): Promise<SupplierCheckView[]> {
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
    .where(and(gte(supplierCheckPayments.paidDate, from), lte(supplierCheckPayments.paidDate, to)))
    .orderBy(desc(supplierCheckPayments.paidDate), desc(supplierCheckPayments.id));

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

  const auditRows = await db
    .select()
    .from(supplierCheckAuditLog)
    .where(inArray(supplierCheckAuditLog.paymentId, paymentIds))
    .orderBy(desc(supplierCheckAuditLog.createdAt));

  const auditByPaymentId = new Map<number, CheckAuditLogEntry[]>();
  for (const r of auditRows) {
    if (r.paymentId == null) continue;
    const list = auditByPaymentId.get(r.paymentId) ?? [];
    list.push({
      id: r.id,
      action: r.action as "EDITED_INVOICE" | "PRINTED_CHECK",
      performedByName: r.performedByName,
      reason: r.reason,
      details: JSON.parse(r.details),
      createdAt: r.createdAt,
    });
    auditByPaymentId.set(r.paymentId, list);
  }

  return payments.map((p) => ({
    ...p,
    status: p.status as "printed" | "paid",
    invoices: invoicesByPaymentId.get(p.id) ?? [],
    auditLog: auditByPaymentId.get(p.id) ?? [],
  }));
}
