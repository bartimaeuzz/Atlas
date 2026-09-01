"use server";

/** Card (2026-08-16) -- the third Ledger channel. Reconcile-a-statement-
 * period model, confirmed with Oliver before building: manual entry one
 * transaction at a time (no CSV/bank import in v1), a target-total match
 * required before a period can be marked reconciled (same discipline as
 * Petty Cash's drawer count), multiple named cards, categories shared
 * with Petty Cash/Supplier Check. See db/schema.ts's cardStatementPeriods
 * comment for the full reasoning. */

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerCards, cardStatementPeriods, cardTransactions } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { verifySecondPerson } from "@/lib/permissions/secondPerson";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { cardReconcileMismatch, cardSideTotals } from "@/lib/ledger/cardReconcile";
import { logActivityStatement } from "@/lib/activityLog/log";
import { validateSplitParts, isSplitFailure } from "@/lib/ledger/cardSplit";

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

export async function toggleLedgerCardActive(cardId: number, nextActive: boolean): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireCapability("LEDGER_CARD_MANAGE");
    await db.update(ledgerCards).set({ active: nextActive }).where(eq(ledgerCards.id, cardId));
    revalidatePath("/ledger/cards");
});
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

/** Deletes a card AND everything under it -- statement periods
 * (reconciled ones included) and their transactions (2026-08-25,
 * Oliver: "card can be delete with popup destructive warning ...
 * technically it won be severe but annoying" -- the statements can
 * always be re-imported, so the data is recoverable-by-redoing, not
 * gone forever). Gate is deliberately BOTH halves of his sentence:
 * the LEDGER_CARD_MANAGE grant and the ADMIN role -- a manager holding
 * the card-admin key can rename/retire but not erase history. The UI
 * fronts this with a typed-word DangerConfirmDialog naming what dies. */
export async function deleteLedgerCard(cardId: number): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireCapability("LEDGER_CARD_MANAGE");
    if (session.systemRole !== "ADMIN") {
      throw new Error("Only an admin account can delete a card. Retire it instead to stop new statement periods.");
    }

    const [card] = await db.select().from(ledgerCards).where(eq(ledgerCards.id, cardId));
    if (!card) throw new Error("Card not found");

    const periods = await db
      .select({ id: cardStatementPeriods.id, periodStart: cardStatementPeriods.periodStart })
      .from(cardStatementPeriods)
      .where(eq(cardStatementPeriods.cardId, cardId));
    const periodIds = periods.map((p) => p.id);
    const txCount =
      periodIds.length > 0
        ? (
            await db
              .select({ id: cardTransactions.id })
              .from(cardTransactions)
              .where(inArray(cardTransactions.statementPeriodId, periodIds))
          ).length
        : 0;
    const earliest = periods.length ? periods.reduce((min, p) => (p.periodStart < min ? p.periodStart : min), periods[0].periodStart) : null;

    // The log sentence is frozen at write time on purpose -- after this
    // batch runs, the rows it describes no longer exist to reconstruct
    // it from (see lib/activityLog/log.ts).
    const logStatement = logActivityStatement({
      actorEmployeeId: session.id,
      type: "ledger_card.card.deleted",
      entityType: "ledger_card",
      entityId: String(cardId),
      summary:
        periods.length > 0
          ? `Deleted card ${card.name} and everything under it — ${periods.length} statement period${periods.length === 1 ? "" : "s"} and ${txCount} transaction${txCount === 1 ? "" : "s"} since ${earliest}`
          : `Deleted card ${card.name} (no statement periods)`,
      detail: { cardName: card.name, periodCount: periods.length, transactionCount: txCount, earliestPeriodStart: earliest },
    });

    // One batch: transactions, periods, card, and the log row commit
    // together or not at all -- a partial delete would orphan money rows,
    // and an erased card without its log row is exactly the silent-miss
    // the activity log exists to prevent. (db.batch's type wants a
    // non-empty literal tuple, hence the branch.)
    if (periodIds.length > 0) {
      await db.batch([
        db.delete(cardTransactions).where(inArray(cardTransactions.statementPeriodId, periodIds)),
        db.delete(cardStatementPeriods).where(eq(cardStatementPeriods.cardId, cardId)),
        db.delete(ledgerCards).where(eq(ledgerCards.id, cardId)),
        logStatement,
      ]);
    } else {
      await db.batch([db.delete(ledgerCards).where(eq(ledgerCards.id, cardId)), logStatement]);
    }

    revalidatePath("/ledger/cards");
    revalidatePath("/ledger/card");
    revalidatePath("/ledger/card/period");
  });
}

/* ---------------------------------------------------------------------- */
/* Statement periods                                                       */
/* ---------------------------------------------------------------------- */

export async function createStatementPeriod(_prevState: CardActionState, formData: FormData): Promise<CardActionState> {
  const cardId = Number(formData.get("cardId"));
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  const statementTotal = Number(formData.get("statementTotal"));
  // Two reconcile targets since 2026-08-25 (see cardStatementPeriods'
  // schema comment): charges side and payments/credits side, both copied
  // from the statement's own summary box. An omitted field parses to 0,
  // which is the right meaning for a statement with no payments/refunds.
  const paymentsCreditsTotal = Number(formData.get("paymentsCreditsTotal") || 0);

  let periodId: number;
  try {
    const session = await requireManagerAction();

    if (!cardId) throw new Error("Choose a card");
    if (!periodStart || !periodEnd) throw new Error("Enter both statement dates");
    if (periodEnd < periodStart) throw new Error("Statement end date can't be before the start date");
    if (!Number.isFinite(statementTotal) || statementTotal < 0) throw new Error("Enter the statement's total charge amount");
    if (!Number.isFinite(paymentsCreditsTotal) || paymentsCreditsTotal < 0) {
      throw new Error("Enter the statement's payments & credits total as a positive number (or leave it 0)");
    }

    const [row] = await db
      .insert(cardStatementPeriods)
      .values({ cardId, periodStart, periodEnd, statementTotal, paymentsCreditsTotal, createdByEmployeeId: session.id })
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
  statementTotal: number,
  paymentsCreditsTotal: number
): Promise<{ error: string | null }> {
  try {
    const session = await requireManagerAction();

    if (!periodStart || !periodEnd) throw new Error("Enter both statement dates");
    if (periodEnd < periodStart) throw new Error("Statement end date can't be before the start date");
    if (!Number.isFinite(statementTotal) || statementTotal < 0) throw new Error("Enter a valid statement total (0 or more)");
    if (!Number.isFinite(paymentsCreditsTotal) || paymentsCreditsTotal < 0) {
      throw new Error("Enter a valid payments & credits total (0 or more)");
    }

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't edit it.");
    }

    await db
      .update(cardStatementPeriods)
      .set({ periodStart, periodEnd, statementTotal, paymentsCreditsTotal })
      .where(eq(cardStatementPeriods.id, periodId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/ledger/card");
  revalidatePath("/ledger/card/period");
  return { error: null };
}

/** Locks the period. Blocked unless BOTH sides of the logged
 * transactions already match the statement's printed targets exactly --
 * positive lines against statementTotal, negative lines against
 * paymentsCreditsTotal (two-sided since 2026-08-25; see
 * lib/ledger/cardReconcile.ts) -- mirroring Petty Cash's "counted must
 * match expected" discipline. Confirmed with Oliver this should be a
 * forced match, not just a log. */
/** `secondPin` is only consulted when Settings has the two-person card
 * control switched ON (2026-09-01) — see markPayrollPeriodPaid for why it
 * starts off and what `singlePerson` records. */
export async function reconcileStatementPeriod(periodId: number, secondPin?: string): Promise<{ error: string | null }> {
  // Return-value errors, not throws -- see editStatementPeriod's comment.
  // The "don't match yet" sentence is the whole reconcile UX; production
  // was redacting it to "Minified React error #441".
  try {
    const session = await requireCapability("FA_LEDGER_CARD_RECONCILE");

    const settings = await loadRestaurantSettings();
    const twoPerson = settings.requireTwoPersonCardReconcile;

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled") return { error: null };

    const txRows = await db
      .select({ amount: cardTransactions.amount })
      .from(cardTransactions)
      .where(eq(cardTransactions.statementPeriodId, periodId));
    const mismatch = cardReconcileMismatch(
      cardSideTotals(txRows.map((t) => t.amount)),
      period.statementTotal,
      period.paymentsCreditsTotal
    );
    if (mismatch) throw new Error(mismatch);

    // Asked for AFTER the balance check on purpose: never make someone walk
    // over to type their PIN for a period that was never going to close.
    if (twoPerson) {
      const problem = await verifySecondPerson("FA_LEDGER_CARD_RECONCILE", session.id, secondPin ?? "");
      if (problem) throw new Error(problem);
    }

    await db
      .update(cardStatementPeriods)
      .set({
        status: "reconciled",
        reconciledAt: new Date().toISOString(),
        reconciledByEmployeeId: session.id,
        singlePerson: !twoPerson,
      })
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

/** Entry-time split (2026-08-25): one statement line entered directly as
 * several categorized rows (an Amazon order with Kitchen/Bar/FOH items).
 * All rows share the line's date; the parts come as JSON from the form's
 * split mode and are re-validated here (client JSON is never trusted on
 * a money path -- same rule as commitStatementImport). Gate is the same
 * coarse requireManagerAction() as addCardTransaction: splitting IS
 * day-to-day entry, so it inherits that decision (see the 2026-08-21
 * comment above requireManagerAction -- do not wire FA_LEDGER_CARD_*
 * here). A single multi-row insert is already atomic. */
export async function addCardTransactionSplit(
  _prevState: CardTransactionActionState,
  formData: FormData
): Promise<CardTransactionActionState> {
  const periodId = Number(formData.get("periodId"));
  const date = String(formData.get("date") ?? "");
  const partsJson = String(formData.get("partsJson") ?? "");

  try {
    const session = await requireManagerAction();

    if (!periodId) throw new Error("Missing statement period");
    if (!date) throw new Error("Missing date");

    let raw: unknown;
    try {
      raw = JSON.parse(partsJson);
    } catch {
      throw new Error("The split's parts were malformed — try again.");
    }
    const validated = validateSplitParts(raw, null);
    if (isSplitFailure(validated)) throw new Error(validated.failure);

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't add more transactions to it.");
    }

    await db.insert(cardTransactions).values(
      validated.parts.map((p) => ({
        statementPeriodId: periodId,
        date,
        categoryId: p.categoryId,
        memo: p.memo,
        amount: p.amount,
        createdByEmployeeId: session.id,
      }))
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/card/period");
  revalidatePath("/ledger/card");
  return { error: null };
}

/** Splits an EXISTING row (usually an imported one) into parts that sum
 * to it exactly -- atomic delete-original + insert-parts, so the period's
 * side totals cannot change by even a cent (validateSplitParts enforces
 * the exact-cents sum server-side). Parts keep the original's date: the
 * statement line's transaction date is what the P&L buckets by. */
export async function splitCardTransaction(transactionId: number, periodId: number, partsJson: string): Promise<ActionResult> {
  // asActionResult: expected failures travel as return values -- see
  // editStatementPeriod's comment on production redaction.
  return asActionResult(async () => {
    const session = await requireManagerAction();

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't split its transactions.");
    }

    const [original] = await db.select().from(cardTransactions).where(eq(cardTransactions.id, transactionId));
    if (!original || original.statementPeriodId !== periodId) throw new Error("Transaction not found in this period");

    let raw: unknown;
    try {
      raw = JSON.parse(partsJson);
    } catch {
      throw new Error("The split's parts were malformed — try again.");
    }
    const validated = validateSplitParts(raw, original.amount);
    if (isSplitFailure(validated)) throw new Error(validated.failure);

    // db.batch: the delete and the inserts commit together or not at all
    // (same pattern as commitStatementImport) -- a partial apply here
    // would silently move the period's reconciliation totals.
    await db.batch([
      db.delete(cardTransactions).where(eq(cardTransactions.id, transactionId)),
      db.insert(cardTransactions).values(
        validated.parts.map((p) => ({
          statementPeriodId: periodId,
          date: original.date,
          categoryId: p.categoryId,
          memo: p.memo,
          amount: p.amount,
          createdByEmployeeId: session.id,
        }))
      ),
    ]);

    revalidatePath("/ledger/card/period");
    revalidatePath("/ledger/card");
  });
}

/** Edits a committed row's memo, category, or date (2026-08-25 --
 * Oliver's "rename and tag": imported lines arrive with the bank's raw
 * description and need renaming/recategorizing after commit). Amount is
 * deliberately NOT editable here -- changing money means delete-and-
 * re-add or split, keeping the paths that move reconciliation totals
 * few and explicit. */
export async function updateCardTransaction(
  transactionId: number,
  periodId: number,
  fields: { date: string; categoryId: number; memo: string }
): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireManagerAction();

    const [period] = await db.select().from(cardStatementPeriods).where(eq(cardStatementPeriods.id, periodId));
    if (!period) throw new Error("Statement period not found");
    if (period.status === "reconciled" && session.systemRole !== "ADMIN") {
      throw new Error("This period is already reconciled -- can't edit its transactions.");
    }

    const [original] = await db.select().from(cardTransactions).where(eq(cardTransactions.id, transactionId));
    if (!original || original.statementPeriodId !== periodId) throw new Error("Transaction not found in this period");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) throw new Error("Enter a valid date");
    const categoryId = Number(fields.categoryId);
    if (!categoryId || !Number.isInteger(categoryId)) throw new Error("Category is required");
    const memo = String(fields.memo ?? "").trim().slice(0, 500) || null;

    await db
      .update(cardTransactions)
      .set({ date: fields.date, categoryId, memo })
      .where(eq(cardTransactions.id, transactionId));

    revalidatePath("/ledger/card/period");
    revalidatePath("/ledger/card");
  });
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
