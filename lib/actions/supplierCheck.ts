"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, supplierCheckPayments } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";

export interface SupplierInvoiceActionState {
  error: string | null;
}

/** Logging an invoice is deliberately its own form, not a reuse of
 * addPettyCashEntry -- Oliver's own words: "the input form on petty
 * cash now won't work on delivery invoice based supplier." No amount
 * paid, no due date (confirmed not needed) -- just what arrived. Now
 * lives at its own /ledger/supplier-check/new page (2026-08-14 UI
 * restructure -- "Add item" button, matching the Vendor/Position
 * dedicated-page pattern), so a successful submit redirects back to the
 * main Supplier Check page instead of staying put. */
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
  redirect("/ledger/supplier-check");
}

export async function deletePendingInvoice(invoiceId: number) {
  const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  if (!invoice) return;
  if (invoice.status !== "pending") {
    throw new Error("This invoice is no longer pending -- can't remove it.");
  }
  await db.delete(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  revalidatePath("/ledger/supplier-check");
}

/** Prints a check for ONE vendor, always combining EVERY currently-
 * pending invoice for that vendor -- confirmed with Oliver after talking
 * to Aey: "same vendor always get combined check." No manual invoice
 * selection anymore (that's how v45 worked; replaced here). Called once
 * per selected vendor by printChecksForVendors below, whether that's one
 * vendor (an urgent, instant check) or every vendor with something
 * pending (the weekly batch) -- both now go through the same "Print
 * Checks" popup on the UI side, the caller just decides how many vendor
 * ids to pass in.
 *
 * Captures the exact invoice ids being combined (not just a re-run of
 * the "status = pending" filter) before updating them, so a brand-new
 * invoice logged in the split second between the select and the update
 * can't sneak into this check without its amount being in the total. */
export async function printSupplierCheck(vendorId: number, checkNumber: string | null): Promise<{ paymentId: number }> {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const pending = await db
    .select()
    .from(supplierInvoices)
    .where(and(eq(supplierInvoices.vendorId, vendorId), eq(supplierInvoices.status, "pending")));

  if (pending.length === 0) {
    throw new Error("This vendor has no pending invoices to print a check for.");
  }

  const pendingIds = pending.map((inv) => inv.id);
  const totalAmount = pending.reduce((sum, inv) => sum + inv.amount, 0);
  const today = new Date().toISOString().slice(0, 10);

  const [payment] = await db
    .insert(supplierCheckPayments)
    .values({
      vendorId,
      paidDate: today,
      checkNumber: checkNumber?.trim() || null,
      totalAmount,
      paidByEmployeeId: session.id,
      status: "printed",
    })
    .returning();

  await db
    .update(supplierInvoices)
    .set({ status: "printed", paymentId: payment.id })
    .where(inArray(supplierInvoices.id, pendingIds));

  revalidatePath("/ledger/supplier-check");
  return { paymentId: payment.id };
}

/** Prints checks for a manager-chosen SET of vendors in one go --
 * 2026-08-14 follow-up: "when i wanna print, should show popup and
 * allow me to choose which vendor i need to print as well because i
 * want a flexibility to print some but not all or print all." Replaces
 * the old all-or-nothing printAllPendingChecks: the UI's "Print Checks"
 * popup lists every vendor with pending invoices and lets a manager
 * check off exactly which ones to print right now -- one (the urgent/
 * instant case, e.g. a maintenance vendor), some, or all (the weekly
 * batch, Aey's routine: "all invoices always get export to check format
 * at the end of the week"). Each selection can carry its own optional
 * check number. Returns the new payment ids so the caller can
 * immediately trigger a combined .xlsx download of everything just
 * printed (see /ledger/supplier-check/export/route.ts). */
export async function printChecksForVendors(
  selections: { vendorId: number; checkNumber: string | null }[]
): Promise<{ paymentIds: number[] }> {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  if (selections.length === 0) {
    throw new Error("Select at least one vendor to print a check for.");
  }

  const paymentIds: number[] = [];
  for (const { vendorId, checkNumber } of selections) {
    const { paymentId } = await printSupplierCheck(vendorId, checkNumber);
    paymentIds.push(paymentId);
  }

  return { paymentIds };
}

/** Marks a PRINTED check as delivered/paid to the supplier -- the final
 * lifecycle stage added 2026-08-14 after talking to Aey: checks get
 * printed/exported first (see printSupplierCheck), then marked paid once
 * actually handed over. Also flips the check's invoices to "paid" so the
 * holistic table's per-invoice detail reflects the final state without
 * needing to join back through the payment's own status every time. */
export async function markSupplierCheckPaid(paymentId: number) {
  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const [payment] = await db.select().from(supplierCheckPayments).where(eq(supplierCheckPayments.id, paymentId));
  if (!payment) throw new Error("Check not found.");
  if (payment.status === "paid") return;

  await db
    .update(supplierCheckPayments)
    .set({ status: "paid", deliveredAt: new Date().toISOString(), deliveredByEmployeeId: session.id })
    .where(eq(supplierCheckPayments.id, paymentId));

  await db.update(supplierInvoices).set({ status: "paid" }).where(eq(supplierInvoices.paymentId, paymentId));

  revalidatePath("/ledger/supplier-check");
}
