"use server";

/** Card (2026-08-16) -- the third Ledger channel. Reconcile-a-statement-
 * period model, confirmed with Oliver before building: manual entry one
 * transaction at a time (no CSV/bank import in v1), a target-total match
 * required before a period can be marked reconciled (same discipline as
 * Petty Cash's drawer count), multiple named cards, categories shared
 * with Petty Cash/Supplier Check. See db/schema.ts's cardStatementPeriods
 * comment for the full reasoning. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerCards, cardStatementPeriods, cardTransactions } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";

export interface CardActionState {
  error: string | null;
}

/** 2026-08-21 (Phase A) — server-action auth audit: same gap class as
 * ledger.ts (see that file's comment on requireManagerAction for the
 * full reasoning) — several functions here only fetched a session to
 * feed the existing reconciled-then-ADMIN-override check, which meant
 * an unauthenticated request could still write as long as the period
 * wasn't already reconciled.
 *
 * 2026-08-21 (Phase B, part 2) — Oliver confirmed Aey should hold the
 * Financial Auditor tier ("aey hold it"), which unblocks wiring the one
 * capability in this file with an unambiguous 1:1 action mapping:
 * reconcileStatementPeriod -> FA_LEDGER_CARD_RECONCILE (registry label
 * "Ledger Card: reconcile" -- there's no other candidate action in this
 * file for that verb). Everything else here stays on the coarse
 * requireManagerAction() gate deliberately, not by oversight:
 *   - createLedgerCard / toggleLedgerCardActive: card admin, same
 *     "no capability exists for this yet" category as ledger.ts's
 *     vendor/category admin functions.
 *   - createStatementPeriod / editStatementPeriod / addCardTransaction /
 *     deleteCardTransaction: day-to-day entry. The registry has
 *     PETTY_CASH_EDIT and SUPPLIER_CHECK_LOG as GENERAL (all-manager-
 *     tier-by-default) capabilities for the other two Ledger channels'
 *     day-to-day entry, but no equivalent exists for Card -- the only
 *     Card capabilities in the registry are the three FA_LEDGER_CARD_*
 *     Financial Auditor ones (IMPORT/CATEGORIZE/RECONCILE), all
 *     Admin-only by default. Mapping ordinary transaction entry onto
 *     FA_LEDGER_CARD_CATEGORIZE (the closest-sounding one, since every
 *     addCardTransaction call includes a categoryId) would be a real
 *     access reduction for every manager who enters card transactions
 *     today -- not something to guess at. Flagged as an open registry
 *     gap for Oliver, not wired. FA_LEDGER_CARD_IMPORT is enforced in
 *     lib/actions/cardImport.ts since 2026-08-24 (statement-file import);
 *     it has no action in THIS file on purpose. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
}

/* ---------------------------------------------------------------------- */
/* Cards (admin)                                                           */
/* ---------------------------------------------------------------------- */

/* Card admin runs on LEDGER_CARD_MANAGE since 2026-08-24 (Oliver asked
 * for name editing "with permission"; the new key covers add/rename/
 * retire as one unit, and create/toggle moved off the coarse
 * requireManagerAction() in the same commit so the /permissions page
 * and these buttons cannot disagree). */
export async function createLedgerCard(_prevState: CardActionState, formData: FormData): Promise<CardActionState> {
  const name = String(formData.get("name") ?? "").trim();
  try {
    await requireCapability("LEDGER_CARD_MANAGE");
    if (!name) throw new Error("Card name is required");
    await db.insert(ledgerCards).values({ name, active: true });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/cards");
  redirect("/ledger/cards");
}

export async function toggleLedgerCardActive(cardId: number, nextActive: boolean) {
  await requireCapability("LEDGER_CARD_MANAGE");
  await db.update(ledgerCards).set({ active: nextActive }).where(eq(ledgerCards.id, cardId));
  revalidatePath("/ledger/cards");
}

export async function renameLedgerCard(_prevState: CardActionState, formData: FormData): Promise<CardActionState> {
  const cardId = Number(formData.get("cardId"));
  const name = String(formData.get("name") ?? "").trim();
  try {
    await requireCapability("LEDGER_CARD_MANAGE");
    if (!cardId) throw new Error("Missing card");
    if (!name) throw new Error("Card name is required");
    await db.update(ledgerCards).set({ name }).where(eq(ledgerCards.id, cardId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/cards");
  return { error: null };
}

/* ---------------------------------------------------------------------- */
/* Statement periods                                                       */
/* ---------------------------------------------------------------------- */

export async function createStatementPeriod(_prevState: CardActionState, formData: FormData): Promise<CardActionState> {
  const cardId = Number(formData.get("cardId"));
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const statementTotal = Number(formData.get("statementTotal"));

  let periodId: number;
  try {
    const session = await requireManagerAction();

    if (!cardId) throw new Error("Choose a card");
    if (!periodStart || !periodEnd) throw new Error("Enter both statement dates");
    if (periodEnd < periodStart) throw new Error("Statement end date can't be before the start date");
    if (!Number.isFinite(statementTotal) || statementTotal < 0) throw new Error("Enter the statement's total charge amount");

    const [row] = await db
      .insert(cardStatementPeriods)
      .values({ cardId, periodStart, periodEnd, statementTotal, createdByEmployeeId: session.id })
      .returning({ id: cardStatementPeriods.id });
    periodId = row.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/card");
  redirect(`/ledger/card/period?id=${periodId}`);
}

/** Edits a period's own header fields (dates/target total) -- blocked
 * once reconciled for everyone except ADMIN, same exception pattern as
 * Petty Cash's finalized-day admin override. Doesn't touch `status`.
 *
 * RETURNS its error instead of throwing (2026-08-24, Oliver hit this
 * live): React redacts any Error thrown out of a server action in
 * production -- the client's catch showed "Minified React error #441"
 * where "Enter a valid statement total" should have been. Expected
 * failures must travel as return values; dev mode shows thrown
 * messages, which is why this class passes every local check. */
export async function editStatementPeriod(
  periodId: number,
  periodStart: string,
  periodEnd: string,
  statementTotal: number
): Promise<{ error: string | null }> {
  try {
    const session = await requireManagerAction();

    if (!periodStart || !periodEnd) throw new Error("Enter both statement dates");
    if (periodEnd < periodStart) throw new Error("Statement end date can't be before the start date");
    if (!Number.isFinite(statementTotal) || statementTotal < 0) throw new Error("Enter a valid statement total (0 or more)");

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't edit it.");
    }

    await db.update(cardStatementPeriods).set({ periodStart, periodEnd, statementTotal }).where(eq(cardStatementPeriods.id, periodId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/card");
  revalidatePath("/ledger/card/period");
  return { error: null };
}

/** Locks the period. Blocked unless the logged transactions already sum
 * to the statement's target total (within a cent -- see
 * loadCardStatementPeriods' `matches` for the same epsilon), mirroring
 * Petty Cash's "counted must match expected" discipline -- confirmed
 * with Oliver this should be a forced match, not just a log. */
export async function reconcileStatementPeriod(periodId: number): Promise<{ error: string | null }> {
  // Return-value errors, not throws -- see editStatementPeriod's comment.
  // The "don't match yet" sentence is the whole reconcile UX; production
  // was redacting it to "Minified React error #441".
  try {
    const session = await requireCapability("FA_LEDGER_CARD_RECONCILE");

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled") return { error: null };

    const txRows = await db
      .select({ amount: cardTransactions.amount })
      .from(cardTransactions)
      .where(eq(cardTransactions.statementPeriodId, periodId));
    const loggedTotal = txRows.reduce((sum, t) => sum + t.amount, 0);

    if (Math.abs(loggedTotal - period.statementTotal) >= 0.01) {
      throw new Error(
        `Logged transactions ($${loggedTotal.toFixed(2)}) don't match the statement total ($${period.statementTotal.toFixed(2)}) yet.`
      );
    }

    await db
      .update(cardStatementPeriods)
      .set({ status: "reconciled", reconciledAt: new Date().toISOString(), reconciledByEmployeeId: session.id })
      .where(eq(cardStatementPeriods.id, periodId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/card");
  revalidatePath("/ledger/card/period");
  return { error: null };
}

/* ---------------------------------------------------------------------- */
/* Transactions                                                            */
/* ---------------------------------------------------------------------- */

export interface CardTransactionActionState {
  error: string | null;
}

export async function addCardTransaction(
  _prevState: CardTransactionActionState,
  formData: FormData
): Promise<CardTransactionActionState> {
  const periodId = Number(formData.get("periodId"));
  const date = String(formData.get("date") ?? "");
  const categoryIdRaw = formData.get("categoryId");
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const amountRaw = formData.get("amount");

  try {
    const session = await requireManagerAction();

    if (!periodId) throw new Error("Missing statement period");
    if (!date) throw new Error("Missing date");
    const categoryId = Number(categoryIdRaw);
    if (!categoryId) throw new Error("Category is required");

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Amount is required (enter a negative number for a credit/refund)");

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't add more transactions to it.");
    }

    await db.insert(cardTransactions).values({
      statementPeriodId: periodId,
      date,
      categoryId,
      memo,
      amount,
      createdByEmployeeId: session.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/card/period");
  revalidatePath("/ledger/card");
  return { error: null };
}

export async function deleteCardTransaction(transactionId: number, periodId: number): Promise<{ error: string | null }> {
  // Return-value errors, not throws -- see editStatementPeriod's comment.
  try {
    const session = await requireManagerAction();
    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (period?.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't remove transactions from it.");
    }
    await db.delete(cardTransactions).where(eq(cardTransactions.id, transactionId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/card/period");
  revalidatePath("/ledger/card");
  return { error: null };
}
