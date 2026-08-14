"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerVendors, ledgerCategories, pettyCashEntries, dailyCashReconciliations, shifts } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";

export interface LedgerAdminActionState {
  error: string | null;
}

/* ---------------------------------------------------------------------- */
/* Vendors                                                                 */
/* ---------------------------------------------------------------------- */

function readVendorForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Vendor name is required");
  return {
    name,
    payeeAddressLine1: String(formData.get("payeeAddressLine1") ?? "").trim() || null,
    payeeAddressLine2: String(formData.get("payeeAddressLine2") ?? "").trim() || null,
    payeeAddressLine3: String(formData.get("payeeAddressLine3") ?? "").trim() || null,
  };
}

export async function createLedgerVendor(_prevState: LedgerAdminActionState, formData: FormData): Promise<LedgerAdminActionState> {
  try {
    const parsed = readVendorForm(formData);
    await db.insert(ledgerVendors).values({ ...parsed, active: true });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/vendors");
  redirect("/ledger/vendors");
}

export async function updateLedgerVendor(_prevState: LedgerAdminActionState, formData: FormData): Promise<LedgerAdminActionState> {
  const vendorId = Number(formData.get("vendorId"));
  if (!vendorId) return { error: "Missing vendor id" };
  try {
    const parsed = readVendorForm(formData);
    await db.update(ledgerVendors).set(parsed).where(eq(ledgerVendors.id, vendorId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/vendors");
  redirect("/ledger/vendors");
}

export async function toggleLedgerVendorActive(vendorId: number, nextActive: boolean) {
  await db.update(ledgerVendors).set({ active: nextActive }).where(eq(ledgerVendors.id, vendorId));
  revalidatePath("/ledger/vendors");
}

/* ---------------------------------------------------------------------- */
/* Categories                                                              */
/* ---------------------------------------------------------------------- */

export async function createLedgerCategory(_prevState: LedgerAdminActionState, formData: FormData): Promise<LedgerAdminActionState> {
  const name = String(formData.get("name") ?? "").trim();
  try {
    if (!name) throw new Error("Category name is required");
    const [existing] = await db.select().from(ledgerCategories).where(eq(ledgerCategories.name, name));
    if (existing) throw new Error(`A category named "${name}" already exists`);
    await db.insert(ledgerCategories).values({ name, active: true });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/categories");
  redirect("/ledger/categories");
}

export async function toggleLedgerCategoryActive(categoryId: number, nextActive: boolean) {
  await db.update(ledgerCategories).set({ active: nextActive }).where(eq(ledgerCategories.id, categoryId));
  revalidatePath("/ledger/categories");
}

/* ---------------------------------------------------------------------- */
/* Petty cash entries                                                      */
/* ---------------------------------------------------------------------- */

export interface PettyCashEntryActionState {
  error: string | null;
}

/** Adding an entry to an already-FINALIZED day is blocked -- once a
 * manager has counted the drawer and signed off, the numbers underneath
 * that count shouldn't move. Reopening (if ever needed) isn't built in
 * v1 -- matches the Closing Report's own "Finalize is a hard lock"
 * precedent rather than inventing a softer rule here. */
export async function addPettyCashEntry(
  _prevState: PettyCashEntryActionState,
  formData: FormData
): Promise<PettyCashEntryActionState> {
  const date = String(formData.get("date") ?? "");
  const categoryIdRaw = formData.get("categoryId");
  const vendorIdRaw = formData.get("vendorId");
  const note = String(formData.get("note") ?? "").trim() || null;
  const amountRaw = formData.get("amount");

  try {
    if (!date) throw new Error("Missing date");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
    const vendorId = vendorIdRaw && String(vendorIdRaw).trim() !== "" ? Number(vendorIdRaw) : null;

    const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existingRecon?.status === "finalized") {
      throw new Error("This day is already finalized -- can't add more entries to it.");
    }

    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    await db.insert(pettyCashEntries).values({
      date,
      vendorId,
      categoryId,
      note,
      amount,
      createdByEmployeeId: session.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger");
  return { error: null };
}

export async function deletePettyCashEntry(entryId: number, date: string) {
  const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
  if (existingRecon?.status === "finalized") {
    throw new Error("This day is already finalized -- can't remove entries from it.");
  }
  await db.delete(pettyCashEntries).where(eq(pettyCashEntries.id, entryId));
  revalidatePath("/ledger");
}

/* ---------------------------------------------------------------------- */
/* Daily reconciliation                                                    */
/* ---------------------------------------------------------------------- */

/** Save-as-you-go for the reconciliation panel (beginning balance, other
 * cash, the manager's physical count, an optional note) -- does NOT lock
 * anything, matches the Weekly Plan's draft-autosave pattern. Upserts
 * since a date's row may not exist yet the first time someone touches it. */
export async function saveDailyReconciliationDraft(
  date: string,
  beginningBalance: number,
  otherCash: number,
  countedAmount: number | null,
  note: string | null
) {
  const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
  if (existing?.status === "finalized") {
    throw new Error("This day is already finalized.");
  }
  if (existing) {
    await db
      .update(dailyCashReconciliations)
      .set({ beginningBalance, otherCash, countedAmount, note })
      .where(eq(dailyCashReconciliations.id, existing.id));
  } else {
    await db.insert(dailyCashReconciliations).values({ date, beginningBalance, otherCash, countedAmount, note, status: "draft" });
  }
  revalidatePath("/ledger");
}

/** Locks the day. Confirmed with Oliver 2026-08-14: "you supposed not to
 * close daily expenses without knowing what cash we would get from
 * register anyway" -- every Shift row for this date must already be
 * finalized (or none exist at all, e.g. a closed day), and the manager
 * must have actually entered a physical count before this can lock,
 * since the whole point of finalizing is confirming the count matches
 * what the ledger expects. */
export async function finalizePettyCashDay(date: string, countedAmount: number, note: string | null) {
  const dayShifts = await db.select({ status: shifts.status }).from(shifts).where(eq(shifts.date, date));
  const anyUnfinalized = dayShifts.some((s) => s.status !== "finalized");
  if (anyUnfinalized) {
    throw new Error("Finish finalizing today's shift(s) first -- cash sales/tips aren't final until the shift is.");
  }
  if (!Number.isFinite(countedAmount)) {
    throw new Error("Enter the counted cash amount before finalizing.");
  }

  const session = await getCurrentStaffSession();
  if (!session) throw new Error("Not signed in");

  const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
  const finalizedAt = new Date().toISOString();
  if (existing) {
    await db
      .update(dailyCashReconciliations)
      .set({ countedAmount, note, status: "finalized", finalizedAt, finalizedByEmployeeId: session.id })
      .where(eq(dailyCashReconciliations.id, existing.id));
  } else {
    await db.insert(dailyCashReconciliations).values({
      date,
      beginningBalance: 0,
      otherCash: 0,
      countedAmount,
      note,
      status: "finalized",
      finalizedAt,
      finalizedByEmployeeId: session.id,
    });
  }
  revalidatePath("/ledger");
}
