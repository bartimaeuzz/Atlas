/**
 * Loaders for Card (2026-08-16) -- the third Ledger channel, built as a
 * reconcile-a-statement-period tool rather than the log-as-you-go shape
 * Petty Cash/Supplier Check use. See db/schema.ts's cardStatementPeriods
 * comment and project_atlas_home_page-adjacent memory for the full design
 * conversation.
 */

import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerCards, cardStatementPeriods, cardTransactions, ledgerCategories, employees } from "@/db/schema";
import { cardSideTotals, cardSideMatches, type CardSideTotals } from "@/lib/ledger/cardReconcile";

export async function loadLedgerCards() {
  return db.select().from(ledgerCards).orderBy(ledgerCards.name);
}

export interface CardStatementPeriodView extends CardSideTotals {
  id: number;
  cardId: number;
  cardName: string;
  periodStart: string;
  periodEnd: string;
  statementTotal: number;
  paymentsCreditsTotal: number;
  /** True only when BOTH sides match their printed targets exactly (see
   * lib/ledger/cardReconcile.ts). */
  matches: boolean;
  status: "draft" | "reconciled";
  reconciledAt: string | null;
  reconciledByName: string | null;
}

/** Every statement period across every card, most recent first -- feeds
 * the list on /ledger/card. Side totals/matches are computed here so the
 * list can show at a glance which periods are ready to reconcile,
 * without a separate query per row. */
export async function loadCardStatementPeriods(): Promise<CardStatementPeriodView[]> {
  const periods = await db
    .select({
      id: cardStatementPeriods.id,
      cardId: cardStatementPeriods.cardId,
      cardName: ledgerCards.name,
      periodStart: cardStatementPeriods.periodStart,
      periodEnd: cardStatementPeriods.periodEnd,
      statementTotal: cardStatementPeriods.statementTotal,
      paymentsCreditsTotal: cardStatementPeriods.paymentsCreditsTotal,
      status: cardStatementPeriods.status,
      reconciledAt: cardStatementPeriods.reconciledAt,
      reconciledByName: employees.nickname,
    })
    .from(cardStatementPeriods)
    .innerJoin(ledgerCards, eq(cardStatementPeriods.cardId, ledgerCards.id))
    .leftJoin(employees, eq(cardStatementPeriods.reconciledByEmployeeId, employees.id))
    .orderBy(desc(cardStatementPeriods.periodStart), desc(cardStatementPeriods.id));

  if (periods.length === 0) return [];

  const allTx = await db
    .select({ statementPeriodId: cardTransactions.statementPeriodId, amount: cardTransactions.amount })
    .from(cardTransactions);
  const amountsByPeriod = new Map<number, number[]>();
  for (const t of allTx) {
    const list = amountsByPeriod.get(t.statementPeriodId);
    if (list) list.push(t.amount);
    else amountsByPeriod.set(t.statementPeriodId, [t.amount]);
  }

  return periods.map((p) => {
    const totals = cardSideTotals(amountsByPeriod.get(p.id) ?? []);
    return {
      ...p,
      ...totals,
      status: p.status as "draft" | "reconciled",
      matches:
        cardSideMatches(totals.chargesLogged, p.statementTotal) &&
        cardSideMatches(totals.creditsLogged, p.paymentsCreditsTotal),
    };
  });
}

export interface CardTransactionView {
  id: number;
  date: string;
  categoryId: number;
  categoryName: string;
  memo: string | null;
  amount: number;
  createdByName: string;
}

export interface CardStatementPeriodDetail extends CardSideTotals {
  id: number;
  cardId: number;
  cardName: string;
  periodStart: string;
  periodEnd: string;
  statementTotal: number;
  paymentsCreditsTotal: number;
  status: "draft" | "reconciled";
  reconciledAt: string | null;
  reconciledByName: string | null;
  transactions: CardTransactionView[];
  categories: { id: number; name: string }[];
}

export async function loadCardStatementPeriodDetail(periodId: number): Promise<CardStatementPeriodDetail | null> {
  const [period] = await db
    .select({
      id: cardStatementPeriods.id,
      cardId: cardStatementPeriods.cardId,
      cardName: ledgerCards.name,
      periodStart: cardStatementPeriods.periodStart,
      periodEnd: cardStatementPeriods.periodEnd,
      statementTotal: cardStatementPeriods.statementTotal,
      paymentsCreditsTotal: cardStatementPeriods.paymentsCreditsTotal,
      status: cardStatementPeriods.status,
      reconciledAt: cardStatementPeriods.reconciledAt,
      reconciledByName: employees.nickname,
    })
    .from(cardStatementPeriods)
    .innerJoin(ledgerCards, eq(cardStatementPeriods.cardId, ledgerCards.id))
    .leftJoin(employees, eq(cardStatementPeriods.reconciledByEmployeeId, employees.id))
    .where(eq(cardStatementPeriods.id, periodId));
  if (!period) return null;

  const txRows = await db
    .select({
      id: cardTransactions.id,
      date: cardTransactions.date,
      categoryId: cardTransactions.categoryId,
      categoryName: ledgerCategories.name,
      memo: cardTransactions.memo,
      amount: cardTransactions.amount,
      createdByName: employees.nickname,
    })
    .from(cardTransactions)
    .innerJoin(ledgerCategories, eq(cardTransactions.categoryId, ledgerCategories.id))
    .innerJoin(employees, eq(cardTransactions.createdByEmployeeId, employees.id))
    .where(eq(cardTransactions.statementPeriodId, periodId))
    .orderBy(cardTransactions.date, cardTransactions.id);

  const categories = await db
    .select({ id: ledgerCategories.id, name: ledgerCategories.name })
    .from(ledgerCategories)
    .where(eq(ledgerCategories.active, true))
    .orderBy(ledgerCategories.name);

  return {
    ...period,
    ...cardSideTotals(txRows.map((t) => t.amount)),
    status: period.status as "draft" | "reconciled",
    transactions: txRows,
    categories,
  };
}
