"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, supplierCheckPayments } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";

export interface SupplierInvoiceActionState {
  error: string | null;
}

/** Logging an invoice is deliberately its own form, not a reuse of
 * addPettyCashEntry -- Oliver's own words: "the input form on petty
 * cash now won't work on delivery invoice based supplier." No amount
 * paid, no due date (confirmed not needed) -- just what arrived. */
export async function logSupplierInvoice(
  _prevState: SupplierInvoiceActionState,
  formData: FormData
): Promise<SupplierInvoiceActionState> {
  const receivedDate = String(formData.get("receivedDate") ?? "");
  const vendorIdRaw = formData.get("vendorId");
  const categoryIdRaw = formData.get("categoryId");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const amountRaw = formData.get("amount");

  try {
    if (!receivedDate) throw new Error("Missing date");
    const vendorId = Number(vendorIdRaw);
    if (!vendorId) throw new Error("Vendor is required");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    if (!invoiceNumber) throw new Error("Invoice number is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");

    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    await db.insert(supplierInvoices).values({
      receivedDate,
      vendorId,
      categoryId,
      invoiceNumber,
      description,
      amount,
      status: "pending",
      createdByEmployeeId: session.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/supplier-check");
  return { error: null };
}

export async function deletePendingInvoice(invoiceId: number) {
  const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  if (!invoice) return;
  if (invoice.status !== "pending") {
    throw new Error("This invoice is already paid -- can't remove it.");
  }
  await db.delete(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  revalidatePath("/ledger/supplier-check");
}

export interface RecordPaymentActionState {
  error: string | null;
}

/** One check can settle several pending invoices from the SAME vendor
 * at once (confirmed with Oliver, matches the real DNA export sheet
 * batching multiple invoice numbers under one check). Validates every
 * selected invoice actually belongs to the given vendor and is still
 * pending -- protects against a stale form submitting an invoice that
 * was already paid (or reassigned) by someone else in the meantime. */
export async function recordSupplierPayment(
  _prevState: RecordPaymentActionState,
  formData: FormData
): Promise<RecordPaymentActionState> {
  const vendorId = Number(formData.get("vendorId"));
  const paidDate = String(formData.get("paidDate") ?? "");
  const checkNumber = String(formData.get("checkNumber") ?? "").trim() || null;
  const invoiceIds = formData
    .getAll("invoiceIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  try {
    if (!vendorId) throw new Error("Missing vendor");
    if (!paidDate) throw new Error("Missing paid date");
    if (invoiceIds.length === 0) throw new Error("Select at least one invoice to mark paid");

    const invoices = await db
      .select()
      .from(supplierInvoices)
      .where(and(inArray(supplierInvoices.id, invoiceIds), eq(supplierInvoices.vendorId, vendorId)));

    const notPending = invoices.filter((inv) => inv.status !== "pending");
    if (notPending.length > 0 || invoices.length !== invoiceIds.length) {
      throw new Error("One or more selected invoices are no longer pending -- refresh and try again.");
    }

    const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount, 0);

    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    const [payment] = await db
      .insert(supplierCheckPayments)
      .values({ vendorId, paidDate, checkNumber, totalAmount, paidByEmployeeId: session.id })
      .returning();

    await db
      .update(supplierInvoices)
      .set({ status: "paid", paymentId: payment.id })
      .where(inArray(supplierInvoices.id, invoiceIds));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/supplier-check");
  return { error: null };
}
