"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, supplierCheckPayments, employees, supplierCheckAuditLog } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { verifyPin } from "@/lib/auth/pin";

export interface SupplierInvoiceActionState {
  error: string | null;
}

/** 2026-08-21 — server-action auth audit: this file had NO auth check at
 * all on deletePendingInvoice, and every other function only fetched a
 * session to feed some other check (or nothing at all) without ever
 * verifying systemRole — same gap class as ledger.ts/card.ts. Base
 * authorization here stays MANAGER/ADMIN (matching the existing /ledger
 * page guard); the separate, tighter Admin-or-financial-auditor +
 * PIN-confirm gate inside editSupplierInvoice for already-printed/paid
 * invoices is untouched — that's a distinct, already-correct check on
 * top of this one, not replaced by it. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
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
    const session = await requireManagerAction();

    if (!receivedDate) throw new Error("Missing date");
    const vendorId = Number(vendorIdRaw);
    if (!vendorId) throw new Error("Vendor is required");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    if (!invoiceNumber) throw new Error("Invoice number is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");

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
  await requireManagerAction();
  const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  if (!invoice) return;
  if (invoice.status !== "pending") {
    throw new Error("This invoice is no longer pending -- can't remove it.");
  }
  await db.delete(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
  revalidatePath("/ledger/supplier-check");
}

export interface EditSupplierInvoiceActionState {
  error: string | null;
}

/** Fix a typo or a wrong amount on an already-logged invoice (2026-08-15,
 * Oliver's ask -- there was previously no way to correct an invoice once
 * it existed; a Pending one could only be deleted and re-entered from
 * scratch, and a Printed/Paid one couldn't be touched at all).
 *
 * Two very different gates depending on status:
 *   - PENDING: open to any manager who reached this page (same level as
 *     deletePendingInvoice above) -- nothing's locked in yet, no
 *     confirmation code needed.
 *   - PRINTED or PAID: this invoice is part of a real, already-issued
 *     check. Oliver's rule: "in real senario it is admin and Aey ... as
 *     Aey will be a financial audit for Youk", with "a prompt to enter
 *     aey secret code for security, like manager code in bank." So:
 *     (a) only an ADMIN account or an employee flagged
 *     `isFinancialAuditor` may even attempt it, AND (b) regardless of
 *     who's doing the edit -- even Aey herself -- her own PIN has to be
 *     re-entered and verified as the confirming sign-off. This is
 *     deliberately NOT "prove you're an admin" -- it's "the auditor
 *     approved this specific change," which is why the code check is
 *     always against a flagged auditor's PIN, never the current
 *     session's own. If more than one employee is flagged, any one of
 *     their codes confirms it.
 *
 * Editing an invoice that's already part of a printed check does NOT
 * regenerate anything on its own -- the check's .xlsx is built on demand
 * from current data every time (see the export route), so the existing
 * "Reprint" link will naturally reflect the corrected number the next
 * time it's clicked. What this DOES do immediately is recompute the
 * parent check's totalAmount, since that's a denormalized sum stored on
 * supplierCheckPayments -- leaving it stale would make the holistic
 * table and reports show the wrong total until a reprint. */
export async function editSupplierInvoice(input: {
  invoiceId: number;
  invoiceNumber: string;
  description: string;
  amount: number;
  reason: string;
  auditorCode?: string;
}): Promise<EditSupplierInvoiceActionState> {
  try {
    const session = await requireManagerAction();

    const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, input.invoiceId));
    if (!invoice) return { error: "Invoice not found." };

    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) return { error: "Invoice number is required." };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { error: "Amount must be a positive number." };
    }
    const description = input.description.trim() || null;
    const reason = input.reason.trim();
    if (!reason) return { error: "A reason for this change is required -- it's logged with the edit." };

    if (invoice.status !== "pending") {
      const isAdmin = session.systemRole === "ADMIN";
      if (!isAdmin && !session.isFinancialAuditor) {
        return { error: "Only an Admin or the financial auditor can edit a check that's already been printed or paid." };
      }

      const code = (input.auditorCode ?? "").trim();
      if (!code) return { error: "Enter the financial auditor's code to confirm this change." };

      const auditors = await db.select().from(employees).where(eq(employees.isFinancialAuditor, true));
      if (auditors.length === 0) {
        return {
          error: 'No financial auditor is set up yet -- check the "Financial auditor" box on their Employee profile first.',
        };
      }
      const codeMatches = auditors.some((a) => a.pinHash && verifyPin(code, a.pinHash));
      if (!codeMatches) {
        return { error: "That code doesn't match -- couldn't confirm this change." };
      }
    }

    await db
      .update(supplierInvoices)
      .set({ invoiceNumber, description, amount: input.amount })
      .where(eq(supplierInvoices.id, input.invoiceId));

    if (invoice.paymentId) {
      const linked = await db.select().from(supplierInvoices).where(eq(supplierInvoices.paymentId, invoice.paymentId));
      const newTotal = linked.reduce((sum, inv) => sum + (inv.id === invoice.id ? input.amount : inv.amount), 0);
      await db.update(supplierCheckPayments).set({ totalAmount: newTotal }).where(eq(supplierCheckPayments.id, invoice.paymentId));
    }

    await db.insert(supplierCheckAuditLog).values({
      invoiceId: invoice.id,
      paymentId: invoice.paymentId,
      vendorId: invoice.vendorId,
      action: "EDITED_INVOICE",
      performedByEmployeeId: session.id,
      performedByName: session.name,
      reason,
      details: JSON.stringify({
        invoiceNumberBefore: invoice.invoiceNumber,
        invoiceNumberAfter: invoiceNumber,
        descriptionBefore: invoice.description,
        descriptionAfter: description,
        amountBefore: invoice.amount,
        amountAfter: input.amount,
      }),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/supplier-check");
  return { error: null };
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
  const session = await requireManagerAction();

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

  await db.insert(supplierCheckAuditLog).values({
    invoiceId: null,
    paymentId: payment.id,
    vendorId,
    action: "PRINTED_CHECK",
    performedByEmployeeId: session.id,
    performedByName: session.name,
    reason: null,
    details: JSON.stringify({ checkNumber: payment.checkNumber, totalAmount, invoiceIds: pendingIds }),
  });

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
  await requireManagerAction();

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
  const session = await requireManagerAction();

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
