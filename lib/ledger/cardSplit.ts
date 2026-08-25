/** Split validation for card statement lines (2026-08-25). One printed
 * line can cover several P&L categories (an Amazon order with Kitchen,
 * Bar and FOH items), so a line may be entered -- or later split -- into
 * multiple cardTransactions rows. Reconciliation only checks that rows
 * sum to the statement's totals, so splitting needs no schema change;
 * what it DOES need is exact-cents discipline, which lives here as a
 * pure, testable function (same server-side-revalidation role as
 * validateCommitRows in lib/import/cardStatement.ts -- client JSON is
 * never trusted on a money path). */

export interface SplitPart {
  categoryId: number;
  amount: number;
  memo: string | null;
}

export interface SplitFailure {
  /** One human sentence for the Banner. */
  failure: string;
}

export function isSplitFailure(r: { parts: SplitPart[] } | SplitFailure): r is SplitFailure {
  return "failure" in r;
}

const toCents = (n: number) => Math.round(n * 100);

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Server-side re-validation of split parts posted from the client.
 *
 * originalAmount === null -> entry-time split (no sum target beyond
 * every part being a nonzero amount).
 * originalAmount given -> the parts' rounded cents must sum EXACTLY to
 * its rounded cents (sign-agnostic: a negative credit line splits into
 * negative parts the same way). All comparisons in integer cents --
 * never float-compare money. */
export function validateSplitParts(raw: unknown, originalAmount: number | null): { parts: SplitPart[] } | SplitFailure {
  if (!Array.isArray(raw) || raw.length < 2) {
    return { failure: "A split needs at least two parts." };
  }
  const parts: SplitPart[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return { failure: "A part was malformed — try again." };
    const { categoryId, amount, memo } = entry as Record<string, unknown>;
    if (typeof categoryId !== "number" || !Number.isInteger(categoryId) || categoryId <= 0) {
      return { failure: "Every part needs a category." };
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || toCents(amount) === 0) {
      return { failure: "Every part needs a nonzero amount." };
    }
    const cleanMemo = typeof memo === "string" ? memo.trim().slice(0, 500) : "";
    parts.push({ categoryId, amount: toCents(amount) / 100, memo: cleanMemo || null });
  }
  if (originalAmount != null) {
    const target = toCents(originalAmount);
    const sum = parts.reduce((acc, p) => acc + toCents(p.amount), 0);
    if (sum !== target) {
      return { failure: `Parts must add up to exactly ${fmt(target)} (they add up to ${fmt(sum)} now).` };
    }
  }
  return { parts };
}
