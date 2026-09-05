/**
 * Loaders for Supplier Check (2026-08-14, extended 2026-08-14 after
 * Oliver's real-workflow conversation with Aey) -- invoice-based vendor
 * payments, distinct from Petty Cash's cash-on-delivery entries. Three-
 * stage lifecycle: an invoice is logged PENDING when a delivery arrives,
 * a check is PRINTED for a vendor (always combining every pending
 * invoice for that vendor -- see lib/actions/supplierCheck.ts's
 * printSupplierCheck), then marked PAID once actually delivered.
 */

import { eq, desc, inArray, and, gte, lte, count } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import {
  supplierInvoices,
  supplierInvoicePhotos,
  supplierCheckPayments,
  ledgerVendors,
  ledgerCategories,
  employees,
  supplierCheckAuditLog,
} from "@/db/schema";

const deliveredByEmployee = alias(employees, "delivered_by_employee");
const readyByEmployee = alias(employees, "ready_by_employee");

export interface PendingInvoiceView {
  id: number;
  receivedDate: string;
  invoiceNumber: string;
  categoryName: string;
  description: string | null;
  amount: number;
  createdByName: string;
  /** Lifecycle rebuild 2026-08-31: draft (editable, awaiting review) or
   * ready (approved & locked, awaiting export). */
  status: "draft" | "ready";
  createdByEmployeeId: number;
  readyByName: string | null;
  /** How many photos of the paper invoice are attached (2026-09-05).
   *  Zero is shown as an explicit "No photo" marker rather than as
   *  nothing at all — the approver is checking the row against the bill,
   *  so "there is no picture" is information, not an empty state. It
   *  warns; it does not block approval (Oliver's call, 2026-09-05). */
  photoCount: number;
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
      createdByName: employees.nickname,
      vendorId: ledgerVendors.id,
      vendorName: ledgerVendors.name,
      status: supplierInvoices.status,
      createdByEmployeeId: supplierInvoices.createdByEmployeeId,
      readyByName: readyByEmployee.nickname,
    })
    .from(supplierInvoices)
    .innerJoin(ledgerVendors, eq(supplierInvoices.vendorId, ledgerVendors.id))
    .innerJoin(ledgerCategories, eq(supplierInvoices.categoryId, ledgerCategories.id))
    .innerJoin(employees, eq(supplierInvoices.createdByEmployeeId, employees.id))
    .leftJoin(readyByEmployee, eq(supplierInvoices.readyByEmployeeId, readyByEmployee.id))
    .where(inArray(supplierInvoices.status, ["draft", "ready"]))
    .orderBy(supplierInvoices.receivedDate);

  // One grouped count for the whole list rather than a count per row --
  // this list is every open invoice across every vendor, so a per-row
  // query would be an N+1 that grows with the week.
  const invoiceIds = rows.map((r) => r.id);
  const photoCounts = new Map<number, number>();
  if (invoiceIds.length > 0) {
    const counted = await db
      .select({ invoiceId: supplierInvoicePhotos.invoiceId, n: count() })
      .from(supplierInvoicePhotos)
      .where(inArray(supplierInvoicePhotos.invoiceId, invoiceIds))
      .groupBy(supplierInvoicePhotos.invoiceId);
    for (const c of counted) photoCounts.set(c.invoiceId, c.n);
  }

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
      status: r.status as "draft" | "ready",
      createdByEmployeeId: r.createdByEmployeeId,
      readyByName: r.readyByName,
      photoCount: photoCounts.get(r.id) ?? 0,
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
  /** Photos of the paper invoice (2026-09-05). Carried here as well as
   *  on the pending list so the picture stays reachable after the
   *  invoice is exported onto a check — the archive is most of the point
   *  of keeping it, and an exported invoice is exactly the one somebody
   *  goes back to months later. */
  photoCount: number;
}

/** One entry in a check's audit trail (2026-08-15, Oliver: "as it
 * concern money it should have a log who do what when with the check
 * and why edit print check"). `details` shape depends on `action` --
 * see supplierCheckAuditLog's schema comment for both shapes. */
export interface CheckAuditLogEntry {
  id: number;
  action: "EDITED_INVOICE" | "PRINTED_CHECK" | "APPROVED_INVOICE" | "UNAPPROVED_INVOICE" | "EXPORTED_CHECK" | "VOIDED_CHECK" | "INSTANT_CHECK";
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
  status: "exported" | "closed" | "void";
  deliveredAt: string | null;
  deliveredByName: string | null;
  /** Void trail + door-2 badge (2026-08-31 lifecycle rebuild). */
  voidedAt: string | null;
  voidReason: string | null;
  singlePerson: boolean;
  instantReason: string | null;
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
      printedByName: employees.nickname,
      status: supplierCheckPayments.status,
      deliveredAt: supplierCheckPayments.deliveredAt,
      deliveredByName: deliveredByEmployee.nickname,
      voidedAt: supplierCheckPayments.voidedAt,
      voidReason: supplierCheckPayments.voidReason,
      singlePerson: supplierCheckPayments.singlePerson,
      instantReason: supplierCheckPayments.instantReason,
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

  // One grouped count for every invoice on every check in the range,
  // rather than one query per invoice.
  const checkInvoiceIds = invoiceRows.map((r) => r.id);
  const checkPhotoCounts = new Map<number, number>();
  if (checkInvoiceIds.length > 0) {
    const counted = await db
      .select({ invoiceId: supplierInvoicePhotos.invoiceId, n: count() })
      .from(supplierInvoicePhotos)
      .where(inArray(supplierInvoicePhotos.invoiceId, checkInvoiceIds))
      .groupBy(supplierInvoicePhotos.invoiceId);
    for (const c of counted) checkPhotoCounts.set(c.invoiceId, c.n);
  }

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
      photoCount: checkPhotoCounts.get(r.id) ?? 0,
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
    status: p.status as "exported" | "closed" | "void",
    invoices: invoicesByPaymentId.get(p.id) ?? [],
    auditLog: auditByPaymentId.get(p.id) ?? [],
  }));
}
