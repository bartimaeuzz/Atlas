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

/** Today as an ISO date string -- used to block logging/reconciling a day
 * that hasn't happened yet (2026-08-14: "not be editable before day
 * comes"). Same UTC convention as everywhere else date math happens in
 * this app (see lib/schedule/weekMath.ts). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

const PNL_GROUPS = ["FOOD", "BEVERAGE_NONALC", "BEVERAGE_ALC", "OTHER_EXPENSE", "EXCLUDED"] as const;
type PnlGroup = (typeof PNL_GROUPS)[number];

export async function createLedgerCategory(_prevState: LedgerAdminActionState, formData: FormData): Promise<LedgerAdminActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const pnlGroupRaw = String(formData.get("pnlGroup") ?? "OTHER_EXPENSE");
  try {
    if (!name) throw new Error("Category name is required");
    const [existing] = await db.select().from(ledgerCategories).where(eq(ledgerCategories.name, name));
    if (existing) throw new Error(`A category named "${name}" already exists`);
    const pnlGroup: PnlGroup = PNL_GROUPS.includes(pnlGroupRaw as PnlGroup) ? (pnlGroupRaw as PnlGroup) : "OTHER_EXPENSE";
    await db.insert(ledgerCategories).values({ name, active: true, pnlGroup });
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

/** Re-tags which P&L bucket this category rolls up into (2026-08-16,
 * Analytics/P&L feature). Kept separate from the rest of the category
 * record on purpose -- this is the ONLY thing the P&L rollup reads to
 * decide where a category's dollars land, so changing it takes effect on
 * every past AND future entry under that category the next time the P&L
 * is viewed (there's nothing per-entry to migrate). */
export async function setLedgerCategoryPnlGroup(categoryId: number, pnlGroup: string) {
  if (!PNL_GROUPS.includes(pnlGroup as PnlGroup)) throw new Error("Invalid P&L group");
  await db.update(ledgerCategories).set({ pnlGroup: pnlGroup as PnlGroup }).where(eq(ledgerCategories.id, categoryId));
  revalidatePath("/ledger/categories");
  revalidatePath("/analytics");
}

/* ---------------------------------------------------------------------- */
/* Petty cash entries                                                      */
/* ---------------------------------------------------------------------- */

export interface PettyCashEntryActionState {
  error: string | null;
}

/** Adding an entry to an already-FINALIZED day is blocked for everyone
 * EXCEPT an ADMIN account (2026-08-14: "let use admin as authorized to
 * edit passed day or finalized item") -- once a manager has counted the
 * drawer and signed off, the numbers underneath that count shouldn't
 * move for ordinary staff/managers, but an admin can still correct a
 * mistake directly rather than needing a whole reopen/re-finalize flow.
 * Also blocks logging against a day that hasn't happened yet -- same
 * date, no exception, since there's nothing real to log against a shift
 * that hasn't run. */
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
    if (date > todayIso()) throw new Error("Can't log petty cash for a day that hasn't happened yet.");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
    const vendorId = vendorIdRaw && String(vendorIdRaw).trim() !== "" ? Number(vendorIdRaw) : null;

    const session = await getCurrentStaffSession();
    if (!session) throw new Error("Not signed in");

    const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existingRecon?.status === "finalized" && session.systemRole !== "ADMIN") {
      throw new Error("This day is already finalized -- can't add more entries to it.");
    }

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

  revalidatePath("/ledger/day");
  revalidatePath("/ledger");
  return { error: null };
}

export async function deletePettyCashEntry(entryId: number, date: string) {
  const session = await getCurrentStaffSession();
  const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
  if (existingRecon?.status === "finalized" && session?.systemRole !== "ADMIN") {
    throw new Error("This day is already finalized -- can't remove entries from it.");
  }
  await db.delete(pettyCashEntries).where(eq(pettyCashEntries.id, entryId));
  revalidatePath("/ledger/day");
  revalidatePath("/ledger");
}

/* ---------------------------------------------------------------------- */
/* Daily reconciliation                                                    */
/* ---------------------------------------------------------------------- */

/** Save-as-you-go for the reconciliation panel (beginning balance, other
 * cash, the manager's physical count, an optional note). For a draft day
 * this doesn't lock anything, matching the Weekly Plan's draft-autosave
 * pattern. For an already-finalized day, only an ADMIN can still save
 * changes (same exception as addPettyCashEntry above) -- and doing so
 * does NOT change `status`, so the day stays finalized; it's a direct
 * correction, not a reopen. Also blocked against a future date, same as
 * logging an entry. Upserts since a date's row may not exist yet the
 * first time someone touches it. */
export async function saveDailyReconciliationDraft(
  date: string,
  beginningBalance: number,
  otherCash: number,
  countedAmount: number | null,
  note: string | null
) {
  if (date > todayIso()) {
    throw new Error("Can't reconcile a day that hasn't happened yet.");
  }
  const session = await getCurrentStaffSession();
  const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
  if (existing?.status === "finalized" && session?.systemRole !== "ADMIN") {
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
  revalidatePath("/ledger/day");
  revalidatePath("/ledger");
}

/** Locks the day. Confirmed with Oliver 2026-08-14: "you supposed not to
 * close daily expenses without knowing what cash we would get from
 * register anyway" -- every Shift row for this date must already be
 * finalized (or none exist at all, e.g. a closed day), and the manager
 * must have actually entered a physical count before this can lock,
 * since the whole point of finalizing is confirming the count matches
 * what the ledger expects. Also can't finalize a day that hasn't
 * happened yet -- in practice this is already impossible since
 * shiftsReady requires finalized shifts that wouldn't exist yet, but the
 * explicit check keeps the rule obvious rather than incidental. */
export async function finalizePettyCashDay(date: string, countedAmount: number, note: string | null) {
  if (date > todayIso()) {
    throw new Error("Can't finalize a day that hasn't happened yet.");
  }
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
  revalidatePath("/ledger/day");
  revalidatePath("/ledger");
}
