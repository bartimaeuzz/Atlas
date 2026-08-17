/**
 * Expense-by-category breakdown for the Analytics/P&L page (2026-08-16)
 * -- pools all three Ledger channels (Petty Cash, Supplier Check, Card)
 * grouped by ledgerCategories.pnlGroup + individual category name, for a
 * date range. No existing loader does this rollup (each channel's own
 * report loader only sums by date/payment, never by category -- see the
 * research done before building this feature) so this is new, but reuses
 * each channel's own established "what counts as this date range" rule
 * rather than inventing a new one:
 *
 *   - Petty Cash: every entry logged with a date in range counts, same
 *     as loadPettyCashReport.ts -- no reconciliation-status filter (an
 *     entry is a real expense the moment it's logged, reconciled or
 *     not).
 *   - Supplier Check: dated by the CHECK's paidDate (when it was printed
 *     /paid), not the invoice's receivedDate -- matches
 *     loadSupplierCheckReport.ts's existing convention (cash/check
 *     basis, same as the reference workbook's own "Export" sheet, which
 *     is paid-check data). A still-Pending invoice (no payment yet) has
 *     no paidDate to place it in a range, so it's excluded until it's
 *     actually paid -- same as the existing report.
 *   - Card: every transaction dated within the statement in range counts
 *     (the charge date on the statement line), regardless of whether
 *     that statement period has been reconciled yet.
 *
 * Categories tagged pnlGroup="EXCLUDED" (the legacy PAYROLL BOH/PAYROLL
 * FOH categories -- see ledgerCategories' schema comment) are kept OUT
 * of `categories`/`total` so they can't double-count against the
 * computed-wage payroll line, but their sum is still surfaced as
 * `excludedTotal` rather than silently vanishing, so a restaurant that
 * still has old manual payroll entries under those categories can see
 * that money is being left out on purpose, not lost.
 */
import { and, gte, lte, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  pettyCashEntries,
  supplierInvoices,
  supplierCheckPayments,
  cardTransactions,
  ledgerCategories,
} from "@/db/schema";

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}

export type PnlGroup = "FOOD" | "BEVERAGE_NONALC" | "BEVERAGE_ALC" | "OTHER_EXPENSE" | "EXCLUDED";

export interface ExpenseCategorySlice {
  categoryId: number;
  categoryName: string;
  pnlGroup: PnlGroup;
  amount: number;
  /** 0-1, share of `total` (excludes the EXCLUDED group entirely, so
   * shares always sum to 1 across the returned `categories`). */
  share: number;
}

export interface ExpenseBreakdown {
  dateFrom: string;
  dateTo: string;
  /** Sum across every category NOT tagged EXCLUDED. */
  total: number;
  categories: ExpenseCategorySlice[]; // sorted by amount desc
  /** Sum of categories tagged EXCLUDED (legacy payroll ledger entries) --
   * left out of `total` on purpose, surfaced so nothing looks silently
   * dropped. */
  excludedTotal: number;
}

export async function loadExpenseBreakdown(dateFrom: string, dateTo: string): Promise<ExpenseBreakdown> {
  const categories = await db.select().from(ledgerCategories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const amountByCategoryId = new Map<number, number>();
  function bump(categoryId: number, amount: number) {
    amountByCategoryId.set(categoryId, (amountByCategoryId.get(categoryId) ?? 0) + amount);
  }

  const [pettyCashRows, cardRows, supplierRows] = await Promise.all([
    db
      .select({ categoryId: pettyCashEntries.categoryId, amount: pettyCashEntries.amount })
      .from(pettyCashEntries)
      .where(and(gte(pettyCashEntries.date, dateFrom), lte(pettyCashEntries.date, dateTo))),
    db
      .select({ categoryId: cardTransactions.categoryId, amount: cardTransactions.amount })
      .from(cardTransactions)
      .where(and(gte(cardTransactions.date, dateFrom), lte(cardTransactions.date, dateTo))),
    db
      .select({ categoryId: supplierInvoices.categoryId, amount: supplierInvoices.amount })
      .from(supplierInvoices)
      .innerJoin(supplierCheckPayments, eq(supplierInvoices.paymentId, supplierCheckPayments.id))
      .where(
        and(
          isNotNull(supplierInvoices.paymentId),
          gte(supplierCheckPayments.paidDate, dateFrom),
          lte(supplierCheckPayments.paidDate, dateTo)
        )
      ),
  ]);

  for (const r of pettyCashRows) bump(r.categoryId, r.amount);
  for (const r of cardRows) bump(r.categoryId, r.amount); // Card amounts are signed -- a refund/credit naturally nets out here.
  for (const r of supplierRows) bump(r.categoryId, r.amount);

  const slices: ExpenseCategorySlice[] = [];
  let total = 0;
  let excludedTotal = 0;

  for (const [categoryId, amount] of amountByCategoryId) {
    const category = categoryById.get(categoryId);
    const pnlGroup: PnlGroup = (category?.pnlGroup as PnlGroup) ?? "OTHER_EXPENSE";
    const rounded = round2(amount);
    if (pnlGroup === "EXCLUDED") {
      excludedTotal = round2(excludedTotal + rounded);
      continue;
    }
    total = round2(total + rounded);
    slices.push({
      categoryId,
      categoryName: category?.name ?? "Unknown",
      pnlGroup,
      amount: rounded,
      share: 0, // filled in below once `total` is final
    });
  }

  const categoriesOut = slices
    .map((s) => ({ ...s, share: total > 0 ? s.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);

  return { dateFrom, dateTo, total, categories: categoriesOut, excludedTotal };
}

/** Sums just one pnlGroup's slices -- a small convenience for the P&L
 * summary table (COGS lines) and the benchmarked KPI ratios, so callers
 * don't re-filter `categories` themselves. */
export function sumByPnlGroup(breakdown: ExpenseBreakdown, group: PnlGroup): number {
  return round2(breakdown.categories.filter((c) => c.pnlGroup === group).reduce((sum, c) => sum + c.amount, 0));
}
