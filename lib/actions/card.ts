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

export interface CardActionState {
  error: string | null;
}

/** 2026-08-21 — server-action auth audit: same gap class as ledger.ts
 * (see that file's comment on requireManagerAction for the full
 * reasoning) — several functions here only fetched a session to feed
 * the existing reconciled-then-ADMIN-override check, which meant an
 * unauthenticated request could still write as long as the period
 * wasn't already reconciled. */
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

export async function createLedgerCard(_prevState: CardActionState, formData: FormData): Promise<CardActionState> {
  const name = String(formData.get("name") ?? "").trim();
  try {
    await requireManagerAction();
    if (!name) throw new Error("Card name is required");
    await db.insert(ledgerCards).values({ name, active: true });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/cards");
  redirect("/ledger/cards");
}

export async function toggleLedgerCardActive(cardId: number, nextActive: boolean) {
  await requireManagerAction();
  await db.update(ledgerCards).set({ active: nextActive }).where(eq(ledgerCards.id, cardId));
  revalidatePath("/ledger/cards");
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
 * Petty Cash's finalized-day admin override. Doesn't touch `status`. */
export async function editStatementPeriod(
  periodId: number,
  periodStart: string,
  periodEnd: string,
  statementTotal: number
) {
  const session = await requireManagerAction();

  if (!periodStart || !periodEnd) throw new Error("Enter both statement dates");
  if (periodEnd < periodStart) throw new Error("Statement end date can't be before the start date");
  if (!Number.isFinite(statementTotal) || statementTotal < 0) throw new Error("Enter a valid statement total");

  const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
  if (!period) throw new Error("Statement period not found");
  if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
    throw new Error("This period is already reconciled -- can't edit it.");
  }

  await db.update(cardStatementPeriods).set({ periodStart, periodEnd, statementTotal }).where(eq(cardStatementPeriods.id, periodId));
  revalidatePath("/ledger/card");
  revalidatePath("/ledger/card/period");
}

/** Locks the period. Blocked unless the logged transactions already sum
 * to the statement's target total (within a cent -- see
 * loadCardStatementPeriods' `matches` for the same epsilon), mirroring
 * Petty Cash's "counted must match expected" discipline -- confirmed
 * with Oliver this should be a forced match, not just a log. */
export async function reconcileStatementPeriod(periodId: number) {
  const session = await requireManagerAction();

  const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
  if (!period) throw new Error("Statement period not found");
  if (period.status === "reconciled") return;

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
  revalidatePath("/ledger/card");
  revalidatePath("/ledger/card/period");
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

export async function deleteCardTransaction(transactionId: number, periodId: number) {
  const session = await requireManagerAction();
  const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
  if (period?.status === "reconciled" && session.systemRole !== "ADMIN") {
    throw new Error("This period is already reconciled -- can't remove transactions from it.");
  }
  await db.delete(cardTransactions).where(eq(cardTransactions.id, transactionId));
  revalidatePath("/ledger/card/period");
  revalidatePath("/ledger/card");
}
