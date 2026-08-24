"use server";

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerVendors, ledgerCategories, pettyCashEntries, dailyCashReconciliations, shifts } from "@/db/schema";
import { logActivityStatement, logMoney } from "@/lib/activityLog/log";
import { requiresOtherCashReason } from "@/lib/ledger/otherCashRule";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";

export interface LedgerAdminActionState {
  error: string | null;
}

/** 2026-08-21 (Phase A) — server-action auth audit: this file had NO auth
 * check at all on most exports. Closed with a MANAGER/ADMIN gate matching
 * the existing /ledger page guard.
 *
 * 2026-08-21 (Phase B) — the confirmed Permission System registry has no
 * capability key covering vendor/category administration specifically
 * (only PETTY_CASH_EDIT, "Petty Cash: enter/edit," is defined for this
 * file — see lib/permissions/capabilities.ts). Rather than guess a
 * mapping for vendors/categories, this helper stays in place for those
 * sections; Petty Cash entries and Daily Reconciliation below (the same
 * /ledger/day page, and the only actions this file's capability registry
 * entry actually names) are wired to requireCapability("PETTY_CASH_EDIT")
 * instead — see project_atlas_permission_system memory. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
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
    await requireManagerAction();
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
    await requireManagerAction();
    const parsed = readVendorForm(formData);
    await db.update(ledgerVendors).set(parsed).where(eq(ledgerVendors.id, vendorId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/vendors");
  redirect("/ledger/vendors");
}

export async function toggleLedgerVendorActive(vendorId: number, nextActive: boolean) {
  await requireManagerAction();
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
    await requireManagerAction();
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

export async function toggleLedgerCategoryActive(categoryId: number, nextActive: boolean): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireManagerAction();
    await db.update(ledgerCategories).set({ active: nextActive }).where(eq(ledgerCategories.id, categoryId));
    revalidatePath("/ledger/categories");
});
}

/** Re-tags which P&L bucket this category rolls up into (2026-08-16,
 * Analytics/P&L feature). Kept separate from the rest of the category
 * record on purpose -- this is the ONLY thing the P&L rollup reads to
 * decide where a category's dollars land, so changing it takes effect on
 * every past AND future entry under that category the next time the P&L
 * is viewed (there's nothing per-entry to migrate). */
export async function setLedgerCategoryPnlGroup(categoryId: number, pnlGroup: string) {
  await requireManagerAction();
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
    const session = await requireCapability("PETTY_CASH_EDIT");

    if (!date) throw new Error("Missing date");
    if (date > todayIso()) throw new Error("Can't log petty cash for a day that hasn't happened yet.");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number");
    const vendorId = vendorIdRaw && String(vendorIdRaw).trim() !== "" ? Number(vendorIdRaw) : null;

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

export async function deletePettyCashEntry(entryId: number, date: string): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("PETTY_CASH_EDIT");
    const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existingRecon?.status === "finalized" && session.systemRole !== "ADMIN") {
      throw new Error("This day is already finalized -- can't remove entries from it.");
    }
    const wasFinalized = existingRecon?.status === "finalized";
    const del = db.delete(pettyCashEntries).where(eq(pettyCashEntries.id, entryId));

    if (wasFinalized) {
      // Admin correcting a closed day: the delete and its log row go in one
      // batch, so a finalized record can never change without a trace.
      const [entry] = await db.select().from(pettyCashEntries).where(eq(pettyCashEntries.id, entryId));
      await db.batch([
        del,
        logActivityStatement({
          actorEmployeeId: session.id,
          type: "petty_cash.entry.deleted",
          entityType: "petty_cash_entry",
          entityId: String(entryId),
          summary: `Deleted a ${logMoney(entry?.amount ?? 0)} expense from finalized day ${date}.`,
          detail: { date, entry },
        }),
      ]);
    } else {
      await del;
    }

    revalidatePath("/ledger/day");
    revalidatePath("/ledger");
});
}

/** Correct an entry in place (2026-08-22, Oliver: "added expense should be
 * able to edit before finalize"). Until now an entry could only be added or
 * deleted, so fixing a mistyped amount -- or a typo in the note -- meant
 * destroying a money record and re-creating it, which loses who logged it
 * and when. All four fields are editable, since the same limitation applied
 * to every one of them.
 *
 * Same finalized-day rule as everywhere else in this file: locked, unless
 * the actor is an ADMIN, and an admin's edit of a closed day is logged
 * atomically alongside the update. */
export async function updatePettyCashEntry(
  entryId: number,
  date: string,
  fields: { categoryId: number; vendorId: number | null; note: string | null; amount: number }
): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("PETTY_CASH_EDIT");

    if (!fields.categoryId) throw new Error("Category is required.");
    if (!Number.isFinite(fields.amount) || fields.amount <= 0) {
      throw new Error("Amount must be a positive number.");
    }

    const [before] = await db.select().from(pettyCashEntries).where(eq(pettyCashEntries.id, entryId));
    if (!before) throw new Error("That expense no longer exists.");
    if (before.date !== date) {
      // The date comes from the page, the entry from the database. If they
      // disagree, something is wrong with the caller -- refuse rather than
      // edit a record on a day the user is not looking at.
      throw new Error("That expense belongs to a different day.");
    }

    const [existingRecon] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existingRecon?.status === "finalized" && session.systemRole !== "ADMIN") {
      throw new Error("This day is already finalized -- can't change its entries.");
    }

    const update = db
      .update(pettyCashEntries)
      .set({ categoryId: fields.categoryId, vendorId: fields.vendorId, note: fields.note, amount: fields.amount })
      .where(eq(pettyCashEntries.id, entryId));

    if (existingRecon?.status === "finalized") {
      const changed = before.amount !== fields.amount
        ? `${logMoney(before.amount)} to ${logMoney(fields.amount)}`
        : "details";
      await db.batch([
        update,
        logActivityStatement({
          actorEmployeeId: session.id,
          type: "petty_cash.entry.updated",
          entityType: "petty_cash_entry",
          entityId: String(entryId),
          summary: `Changed an expense on finalized day ${date} -- ${changed}.`,
          detail: { date, before, after: fields },
        }),
      ]);
    } else {
      await update;
    }

    revalidatePath("/ledger/day");
    revalidatePath("/ledger");
});
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
  note: string | null,
  otherCashReason: string | null
): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("PETTY_CASH_EDIT");
    if (date > todayIso()) {
      throw new Error("Can't reconcile a day that hasn't happened yet.");
    }

    // Cash added to the drawer must say where it came from (Oliver,
    // 2026-08-22 -- his example: a top-up from the BofA account). Money
    // appearing in a drawer with no stated reason is precisely what a
    // reconciliation exists to catch. Enforced here rather than as a NOT
    // NULL column so it can say something readable, and so the rows that
    // predate the column stay valid.
    const reason = otherCashReason?.trim() || null;
    if (requiresOtherCashReason(otherCash) && !reason) {
      throw new Error("Say where the added cash came from.");
    }

    const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existing?.status === "finalized" && session.systemRole !== "ADMIN") {
      throw new Error("This day is already finalized.");
    }

    if (existing) {
      const update = db
        .update(dailyCashReconciliations)
        .set({ beginningBalance, otherCash, countedAmount, note, otherCashReason: reason })
        .where(eq(dailyCashReconciliations.id, existing.id));

      if (existing.status === "finalized") {
        await db.batch([
          update,
          logActivityStatement({
            actorEmployeeId: session.id,
            type: "petty_cash.day.reconciliation_edited",
            entityType: "daily_cash_reconciliation",
            entityId: date,
            summary: `Edited the cash reconciliation on finalized day ${date}.`,
            detail: {
              before: {
                beginningBalance: existing.beginningBalance,
                otherCash: existing.otherCash,
                countedAmount: existing.countedAmount,
                note: existing.note,
                otherCashReason: existing.otherCashReason,
              },
              after: { beginningBalance, otherCash, countedAmount, note, otherCashReason: reason },
            },
          }),
        ]);
      } else {
        await update;
      }
    } else {
      await db.insert(dailyCashReconciliations).values({
        date,
        beginningBalance,
        otherCash,
        countedAmount,
        note,
        otherCashReason: reason,
        status: "draft",
      });
    }

    revalidatePath("/ledger/day");
    revalidatePath("/ledger");
});
}

/** Save just the physical count and the note.
 *
 * Split out from saveDailyReconciliationDraft on 2026-08-22, and the reason
 * is a bug the desktop layout made possible. There, all three steps render
 * at once: step 2 owns the cash fields, step 3 owns the count. If step 3's
 * Save also sent the cash fields, it would send whatever the SERVER last
 * rendered -- silently reverting anything the user had typed into step 2
 * and not yet saved. A step that writes columns it does not own is a data
 * race with a person in it.
 *
 * So each step writes only its own fields, and the clobber cannot happen.
 */
export async function saveDailyCount(date: string, countedAmount: number | null, note: string | null): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("PETTY_CASH_EDIT");
    if (date > todayIso()) {
      throw new Error("Can't reconcile a day that hasn't happened yet.");
    }

    const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    if (existing?.status === "finalized" && session.systemRole !== "ADMIN") {
      throw new Error("This day is already finalized.");
    }

    if (existing) {
      const update = db
        .update(dailyCashReconciliations)
        .set({ countedAmount, note })
        .where(eq(dailyCashReconciliations.id, existing.id));

      if (existing.status === "finalized") {
        await db.batch([
          update,
          logActivityStatement({
            actorEmployeeId: session.id,
            type: "petty_cash.day.reconciliation_edited",
            entityType: "daily_cash_reconciliation",
            entityId: date,
            summary: `Edited the counted amount on finalized day ${date}.`,
            detail: {
              before: { countedAmount: existing.countedAmount, note: existing.note },
              after: { countedAmount, note },
            },
          }),
        ]);
      } else {
        await update;
      }
    } else {
      await db.insert(dailyCashReconciliations).values({ date, countedAmount, note, status: "draft" });
    }

    revalidatePath("/ledger/day");
    revalidatePath("/ledger");
});
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
export async function finalizePettyCashDay(date: string, countedAmount: number, note: string | null): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    const session = await requireCapability("PETTY_CASH_EDIT");

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

    const [existing] = await db.select().from(dailyCashReconciliations).where(eq(dailyCashReconciliations.date, date));
    const finalizedAt = new Date().toISOString();

    // Finalizing locks a day's money. That is worth a log line on its own,
    // not only when an admin later corrects it -- the Activity Log Centre
    // should be able to answer "who closed this day, and when" without
    // depending on the reconciliation row still existing in its original
    // shape.
    const logStatement = logActivityStatement({
      actorEmployeeId: session.id,
      type: "petty_cash.day.finalized",
      entityType: "daily_cash_reconciliation",
      entityId: date,
      summary: `Finalized ${date} with ${logMoney(countedAmount)} counted in the drawer.`,
      detail: { date, countedAmount, note },
    });

    if (existing) {
      await db.batch([
        db
          .update(dailyCashReconciliations)
          .set({ countedAmount, note, status: "finalized", finalizedAt, finalizedByEmployeeId: session.id })
          .where(eq(dailyCashReconciliations.id, existing.id)),
        logStatement,
      ]);
    } else {
      await db.batch([
        db.insert(dailyCashReconciliations).values({
          date,
          beginningBalance: 0,
          otherCash: 0,
          countedAmount,
          note,
          status: "finalized",
          finalizedAt,
          finalizedByEmployeeId: session.id,
        }),
        logStatement,
      ]);
    }
    revalidatePath("/ledger/day");
    revalidatePath("/ledger");
});
}
