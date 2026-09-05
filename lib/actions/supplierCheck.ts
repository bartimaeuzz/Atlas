"use server";

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { businessTodayIso } from "@/lib/formatDateTime";
import { revalidatePath } from "next/cache";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { supplierInvoices, supplierInvoicePhotos, supplierCheckPayments, employees, supplierCheckAuditLog, restaurantSettings, employeeCapabilities } from "@/db/schema";
import { deleteBlobQuietly } from "@/lib/ledger/invoicePhotos";
import { verifyPin } from "@/lib/auth/pin";
import { requireCapability } from "@/lib/permissions/requireCapability";

export interface SupplierInvoiceActionState {
  error: string | null;
  /** The row just created, on success only (2026-09-05). The action used
   *  to redirect to the photo page; it returns the id instead so the
   *  caller decides what happens next -- the "+ Add item" popup swaps to
   *  its photo step without the page moving, and the /new page navigates
   *  as before. A redirect here would have made the popup impossible. */
  invoiceId?: number;
}

/** Supplier Check lifecycle, rebuilt 2026-08-31 from the spec Oliver and
 * Aey approved (see the supplier-check-lifecycle artifact; found via the
 * 2026-08-31 code audit that started from Aey's "can admin delete a
 * printed invoice?").
 *
 * Invoice: draft → ready → exported → closed.
 * Check:   exported → closed, with void as the branch.
 *
 * The load-bearing rules, each enforced HERE (the UI only mirrors them):
 *  - draft is freely editable/deletable by SUPPLIER_CHECK_LOG holders;
 *  - ready is THE LOCK — only an approver can bounce it back to draft;
 *  - the approver can never be the logger (two-person control — the
 *    thing the old shared SUPPLIER_CHECK_LOG capability silently lacked);
 *  - after export NOTHING is editable by anyone — a mistake voids the
 *    whole check (its invoices bounce back to ready) and a new check is
 *    issued. The old auditor-PIN edit-locked-invoice path is retired;
 *    the auditor PIN now signs off VOIDS instead (approved decision #1);
 *  - check numbers are Atlas's own forward-only sequence, claimed
 *    atomically from restaurantSettings.nextCheckNumber; voided numbers
 *    stay burned. The 9 legacy prod checks keep their empty numbers;
 *  - door 2 (instant check) is one person + typed reason + permanent
 *    single-person badge; above the Settings ceiling it needs a second
 *    person's PIN — someone holding SUPPLIER_CHECK_APPROVE who is not
 *    the actor. */

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
  let newInvoiceId = 0;

  try {
    const session = await requireCapability("SUPPLIER_CHECK_LOG");

    if (!receivedDate) throw new Error("Missing date");
    const vendorId = Number(vendorIdRaw);
    if (!vendorId) throw new Error("Vendor is required");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    if (!invoiceNumber) throw new Error("Invoice number is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");

    const [created] = await db
      .insert(supplierInvoices)
      .values({
        receivedDate,
        vendorId,
        categoryId,
        invoiceNumber,
        description,
        amount,
        // Explicit, not the schema default — the code must not depend on
        // which DDL default a given database carries (2026-08-31).
        status: "draft",
        createdByEmployeeId: session.id,
      })
      .returning({ id: supplierInvoices.id });
    newInvoiceId = created.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/supplier-check");
  // The id goes back to the caller rather than a redirect (2026-09-05).
  // Whoever logged this is holding the paper invoice right now, so the
  // camera has to be the next thing they see -- but inside the popup they
  // are already in, not on a page that replaces the list underneath them.
  return { error: null, invoiceId: newInvoiceId };
}

/** Delete is DRAFT-only, for everyone (approved decision #5): a draft is
 * the one state with nothing attached to it — no approval, no check, no
 * paper in a supplier's hands. From ready upward the paths are bounce
 * back / void, never delete. */
/** Returns its failure instead of throwing (2026-09-05). A thrown
 *  server-action error is redacted to a generic digest in production, so
 *  the manager was shown nothing at all — and the one message this action
 *  has ("ask the approver to bounce it back to draft") is the whole
 *  instruction. Matches uploadInvoicePhoto's shape. */
export async function deleteDraftInvoice(invoiceId: number): Promise<{ error: string | null }> {
  let photos: { pathname: string }[] = [];
  try {
    await requireCapability("SUPPLIER_CHECK_LOG");
    const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
    if (!invoice) return { error: null }; // already gone — nothing to undo
    if (invoice.status !== "draft") {
      throw new Error("Only a draft can be removed. This invoice has been approved — ask the approver to bounce it back to draft first.");
    }

    // Its photos go with it (2026-09-05). The FK carries ON DELETE cascade
    // and db/client.ts does set `PRAGMA foreign_keys = ON`, but that pragma
    // is fired and forgotten per connection, so the rows are deleted
    // explicitly rather than left to it. The pathnames are needed here
    // regardless: the stored FILES have no cascade of any kind, and without
    // this they sit in the Blob store forever with nothing pointing at them.
    photos = await db
      .select({ pathname: supplierInvoicePhotos.pathname })
      .from(supplierInvoicePhotos)
      .where(eq(supplierInvoicePhotos.invoiceId, invoiceId));

    await db.batch([
      db.delete(supplierInvoicePhotos).where(eq(supplierInvoicePhotos.invoiceId, invoiceId)),
      db.delete(supplierInvoices).where(eq(supplierInvoices.id, invoiceId)),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // After the rows are gone, so a storage failure cannot leave an invoice
  // the manager was told is deleted. Outside the try for the same reason:
  // the invoice IS deleted by now, and a Blob hiccup must not report that
  // as a failure.
  for (const photo of photos) await deleteBlobQuietly(photo.pathname);

  revalidatePath("/ledger/supplier-check");
  return { error: null };
}

export interface EditSupplierInvoiceActionState {
  error: string | null;
}

/** Fix a typo or wrong amount on a DRAFT invoice. That is the whole
 * scope now (2026-08-31): the old two-gate version that let an
 * auditor-PIN sign off edits to Printed/Paid invoices is retired by the
 * approved spec — after export nothing is edited, a mistake voids the
 * check. Ready is also not editable here: the approver checked those
 * exact numbers, so the path is unapprove → edit → re-approve. */
export async function editSupplierInvoice(input: {
  invoiceId: number;
  invoiceNumber: string;
  description: string;
  amount: number;
  reason: string;
}): Promise<EditSupplierInvoiceActionState> {
  try {
    const session = await requireCapability("SUPPLIER_CHECK_LOG");

    const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, input.invoiceId));
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "draft") {
      return {
        error:
          invoice.status === "ready"
            ? "This invoice has been approved and is locked. The approver can bounce it back to draft to allow edits."
            : "This invoice is already on a check. Nothing on a check is edited — if it's wrong, the check has to be voided and reissued.",
      };
    }

    const invoiceNumber = input.invoiceNumber.trim();
    if (!invoiceNumber) return { error: "Invoice number is required." };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { error: "Amount must be a positive number." };
    }
    const description = input.description.trim() || null;
    const reason = input.reason.trim();
    if (!reason) return { error: "A reason for this change is required -- it's logged with the edit." };

    await db
      .update(supplierInvoices)
      .set({ invoiceNumber, description, amount: input.amount })
      .where(eq(supplierInvoices.id, input.invoiceId));

    await db.insert(supplierCheckAuditLog).values({
      invoiceId: invoice.id,
      paymentId: null,
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

/** Draft → Ready: the approver checked this invoice against the actual
 * bill. THE two-person control lives on this line: the approver can
 * never be the person who logged it — otherwise one account both writes
 * the number and certifies it, which is the hole the whole rebuild
 * exists to close. */
export async function approveInvoice(invoiceId: number): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireCapability("SUPPLIER_CHECK_APPROVE");
    const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "draft") throw new Error("Only a draft can be approved.");
    if (invoice.createdByEmployeeId === session.id) {
      throw new Error("You logged this invoice yourself — a different person has to approve it. That's the whole point of the review step.");
    }
    await db
      .update(supplierInvoices)
      .set({ status: "ready", readyAt: new Date().toISOString(), readyByEmployeeId: session.id })
      .where(eq(supplierInvoices.id, invoiceId));
    await db.insert(supplierCheckAuditLog).values({
      invoiceId,
      paymentId: null,
      vendorId: invoice.vendorId,
      action: "APPROVED_INVOICE",
      performedByEmployeeId: session.id,
      performedByName: session.name,
      reason: null,
      details: JSON.stringify({ invoiceNumber: invoice.invoiceNumber, amount: invoice.amount }),
    });
    revalidatePath("/ledger/supplier-check");
  });
}

/** Ready → Draft: the approver unlocks an invoice so the logger can fix
 * it. Approver-only — the lock means nothing if the logger can lift it. */
export async function unapproveInvoice(invoiceId: number): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireCapability("SUPPLIER_CHECK_APPROVE");
    const [invoice] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoiceId));
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== "ready") throw new Error("Only a Ready invoice can be bounced back to draft.");
    await db
      .update(supplierInvoices)
      .set({ status: "draft", readyAt: null, readyByEmployeeId: null })
      .where(eq(supplierInvoices.id, invoiceId));
    await db.insert(supplierCheckAuditLog).values({
      invoiceId,
      paymentId: null,
      vendorId: invoice.vendorId,
      action: "UNAPPROVED_INVOICE",
      performedByEmployeeId: session.id,
      performedByName: session.name,
      reason: null,
      details: JSON.stringify({ invoiceNumber: invoice.invoiceNumber }),
    });
    revalidatePath("/ledger/supplier-check");
  });
}

/** Claims `count` sequential check numbers atomically. One UPDATE ...
 * RETURNING so two concurrent exports can never hand out the same
 * number — the whole void design rests on numbers being unique and
 * forward-only. Throws (refuses, doesn't improvise) when the sequence
 * was never configured. */
async function claimCheckNumbers(count: number): Promise<number[]> {
  const [row] = await db
    .update(restaurantSettings)
    .set({ nextCheckNumber: sql`${restaurantSettings.nextCheckNumber} + ${count}` })
    .where(and(eq(restaurantSettings.restaurantId, 1), sql`${restaurantSettings.nextCheckNumber} IS NOT NULL`))
    .returning({ next: restaurantSettings.nextCheckNumber });
  if (!row || row.next == null) {
    throw new Error(
      "The check number sequence isn't set up yet. An Admin or Partner sets the next check number (from the physical checkbook) in Settings first."
    );
  }
  const end = row.next; // already incremented — numbers are [end-count, end-1]
  return Array.from({ length: count }, (_, i) => end - count + i);
}

/** Exports a chosen SET of READY invoices as checks — one check per
 * vendor, combining that vendor's selected invoices. Approver-only, and
 * per-invoice selection on purpose (approved spec): one questionable
 * invoice can be held back without blocking the vendor's other bills.
 * Numbers come from the atomic sequence; the file itself is generated by
 * the export route from these payment rows, on demand, every time. */
export async function exportChecks(invoiceIds: number[]): Promise<{ paymentIds: number[]; error: string | null }> {
  const paymentIds: number[] = [];
  try {
    const session = await requireCapability("SUPPLIER_CHECK_APPROVE");
    if (invoiceIds.length === 0) throw new Error("Select at least one invoice to export.");

    const invoices = await db.select().from(supplierInvoices).where(inArray(supplierInvoices.id, invoiceIds));
    if (invoices.length !== invoiceIds.length) throw new Error("Some selected invoices no longer exist — refresh and try again.");
    const notReady = invoices.filter((i) => i.status !== "ready");
    if (notReady.length > 0) {
      throw new Error(
        `${notReady.length} selected invoice${notReady.length === 1 ? " is" : "s are"} not Ready — only approved invoices can go on a check.`
      );
    }

    const byVendor = new Map<number, typeof invoices>();
    for (const inv of invoices) {
      const list = byVendor.get(inv.vendorId) ?? [];
      list.push(inv);
      byVendor.set(inv.vendorId, list);
    }

    const numbers = await claimCheckNumbers(byVendor.size);
    const today = businessTodayIso();

    let n = 0;
    for (const [vendorId, vendorInvoices] of byVendor) {
      const totalAmount = vendorInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const [payment] = await db
        .insert(supplierCheckPayments)
        .values({
          vendorId,
          paidDate: today,
          checkNumber: String(numbers[n]),
          totalAmount,
          paidByEmployeeId: session.id,
          status: "exported",
        })
        .returning();
      n += 1;

      await db
        .update(supplierInvoices)
        .set({ status: "exported", paymentId: payment.id })
        .where(inArray(supplierInvoices.id, vendorInvoices.map((i) => i.id)));

      await db.insert(supplierCheckAuditLog).values({
        invoiceId: null,
        paymentId: payment.id,
        vendorId,
        action: "EXPORTED_CHECK",
        performedByEmployeeId: session.id,
        performedByName: session.name,
        reason: null,
        details: JSON.stringify({ checkNumber: payment.checkNumber, totalAmount, invoiceIds: vendorInvoices.map((i) => i.id) }),
      });
      paymentIds.push(payment.id);
    }
  } catch (e) {
    return { paymentIds, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/supplier-check");
  return { paymentIds, error: null };
}

/** Verifies a PIN against every flagged financial auditor — the same
 * "whose sign-off counts" identity rule the retired locked-edit path
 * used (2026-08-23, Oliver: always a flagged auditor's PIN, never the
 * current session's own — otherwise an Admin approves their own act). */
async function verifyAuditorCode(code: string): Promise<string | null> {
  const trimmed = code.trim();
  if (!trimmed) return 'Enter the financial auditor\'s code to confirm.';
  const auditors = await db.select().from(employees).where(eq(employees.isFinancialAuditor, true));
  if (auditors.length === 0) {
    return 'No financial auditor is set up yet -- check the "Financial auditor" box on their Employee profile first.';
  }
  if (!auditors.some((a) => a.pinHash && verifyPin(trimmed, a.pinHash))) {
    return "That code doesn't match -- couldn't confirm.";
  }
  return null;
}

/** Voids a whole check (approved spec — never a single line: the paper
 * in the supplier's hand is one piece, and pulling one line would make
 * the system disagree with it). Approver + typed reason + the financial
 * auditor's PIN. The check row and its burned number stay forever; its
 * invoices bounce back to Ready for correction and reissue. */
export async function voidSupplierCheck(input: {
  paymentId: number;
  reason: string;
  auditorCode: string;
}): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireCapability("SUPPLIER_CHECK_APPROVE");
    const reason = input.reason.trim();
    if (!reason) throw new Error("Write why this check is being voided — the reason goes on the permanent record.");
    const codeError = await verifyAuditorCode(input.auditorCode);
    if (codeError) throw new Error(codeError);

    const [payment] = await db.select().from(supplierCheckPayments).where(eq(supplierCheckPayments.id, input.paymentId));
    if (!payment) throw new Error("Check not found.");
    if (payment.status === "void") return;
    if (payment.status === "closed") {
      throw new Error(
        "This check is already marked delivered to the supplier. If it truly must be reversed, that's a conversation with the supplier and the bank — not a button."
      );
    }

    await db
      .update(supplierCheckPayments)
      .set({ status: "void", voidedAt: new Date().toISOString(), voidedByEmployeeId: session.id, voidReason: reason })
      .where(eq(supplierCheckPayments.id, input.paymentId));

    await db
      .update(supplierInvoices)
      .set({ status: "ready", paymentId: null })
      .where(eq(supplierInvoices.paymentId, input.paymentId));

    await db.insert(supplierCheckAuditLog).values({
      invoiceId: null,
      paymentId: payment.id,
      vendorId: payment.vendorId,
      action: "VOIDED_CHECK",
      performedByEmployeeId: session.id,
      performedByName: session.name,
      reason,
      details: JSON.stringify({ checkNumber: payment.checkNumber, totalAmount: payment.totalAmount }),
    });

    revalidatePath("/ledger/supplier-check");
  });
}

export interface InstantCheckActionState {
  error: string | null;
  paymentId?: number;
}

/** Door 2 — the plumber is waiting (Oliver's scenario, approved spec).
 * One person logs the invoice AND issues the check in a single act.
 * Cannot be prevented, so it is made VISIBLE instead: typed reason,
 * permanent single-person badge, and a separate listing the approver
 * reviews after the fact. Above the Settings ceiling, a second person
 * holding SUPPLIER_CHECK_APPROVE (not the actor) enters their PIN. */
export async function issueInstantCheck(
  _prevState: InstantCheckActionState,
  formData: FormData
): Promise<InstantCheckActionState> {
  try {
    const session = await requireCapability("SUPPLIER_CHECK_INSTANT");

    const receivedDate = String(formData.get("receivedDate") ?? "") || businessTodayIso();
    const vendorId = Number(formData.get("vendorId"));
    const categoryId = Number(formData.get("categoryId"));
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const amount = Number(formData.get("amount"));
    const instantReason = String(formData.get("instantReason") ?? "").trim();

    if (!vendorId) throw new Error("Vendor is required");
    if (!categoryId) throw new Error("Category is required");
    if (!invoiceNumber) throw new Error("Invoice number is required");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
    if (!instantReason) throw new Error("Write why this check can't wait for the weekly batch — the reason goes on the permanent record.");

    const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
    const ceiling = settings?.instantCheckCeiling ?? 500;
    if (amount > ceiling) {
      const secondPin = String(formData.get("secondPin") ?? "").trim();
      if (!secondPin) {
        throw new Error(
          `This check is over the $${ceiling.toFixed(0)} single-person ceiling — a second person who can approve checks has to enter their PIN.`
        );
      }
      // The co-signer must hold the approve capability and must not be
      // the actor — a second copy of the actor's own PIN is not a
      // second person.
      const approverRows = await db
        .select({ employeeId: employeeCapabilities.employeeId })
        .from(employeeCapabilities)
        .where(and(eq(employeeCapabilities.capabilityKey, "SUPPLIER_CHECK_APPROVE"), eq(employeeCapabilities.granted, true)));
      const adminRows = await db.select().from(employees).where(eq(employees.systemRole, "ADMIN"));
      const cosignerIds = new Set<number>([...approverRows.map((r) => r.employeeId), ...adminRows.map((a) => a.id)]);
      cosignerIds.delete(session.id);
      const cosigners = cosignerIds.size
        ? await db.select().from(employees).where(inArray(employees.id, Array.from(cosignerIds)))
        : [];
      const pinOk = cosigners.some((c) => c.pinHash && verifyPin(secondPin, c.pinHash));
      if (!pinOk) {
        throw new Error("That PIN doesn't belong to another person who can approve checks — couldn't confirm.");
      }
    }

    const [number] = await claimCheckNumbers(1);
    const today = businessTodayIso();

    const [payment] = await db
      .insert(supplierCheckPayments)
      .values({
        vendorId,
        paidDate: today,
        checkNumber: String(number),
        totalAmount: amount,
        paidByEmployeeId: session.id,
        status: "exported",
        singlePerson: true,
        instantReason,
      })
      .returning();

    await db.insert(supplierInvoices).values({
      receivedDate,
      vendorId,
      categoryId,
      invoiceNumber,
      description,
      amount,
      status: "exported",
      paymentId: payment.id,
      createdByEmployeeId: session.id,
    });

    await db.insert(supplierCheckAuditLog).values({
      invoiceId: null,
      paymentId: payment.id,
      vendorId,
      action: "INSTANT_CHECK",
      performedByEmployeeId: session.id,
      performedByName: session.name,
      reason: instantReason,
      details: JSON.stringify({ checkNumber: payment.checkNumber, totalAmount: amount, overCeiling: amount > ceiling }),
    });

    revalidatePath("/ledger/supplier-check");
    return { error: null, paymentId: payment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Exported → Closed: the check physically reached the supplier (a
 * person confirms the hand-over; nobody waits for the bank). Kept on
 * FA_SUPPLIER_CHECK_FINALIZE — the last step before a payment is
 * settled belongs with whoever reconciles (2026-08-23 split). */
export async function markSupplierCheckPaid(paymentId: number): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireCapability("FA_SUPPLIER_CHECK_FINALIZE");

    const [payment] = await db.select().from(supplierCheckPayments).where(eq(supplierCheckPayments.id, paymentId));
    if (!payment) throw new Error("Check not found.");
    if (payment.status === "closed") return;
    if (payment.status === "void") throw new Error("This check was voided — it can't be marked delivered.");

    await db
      .update(supplierCheckPayments)
      .set({ status: "closed", deliveredAt: new Date().toISOString(), deliveredByEmployeeId: session.id })
      .where(eq(supplierCheckPayments.id, paymentId));

    await db.update(supplierInvoices).set({ status: "closed" }).where(eq(supplierInvoices.paymentId, paymentId));

    revalidatePath("/ledger/supplier-check");
  });
}
