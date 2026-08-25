/** Two-sided reconcile math for card statement periods (2026-08-25).
 * US statements print charges and payments/credits as separate summary
 * numbers, so Atlas checks each side against its own printed target:
 * positive lines against statementTotal (purchases + fees + interest),
 * negative lines against paymentsCreditsTotal (bill payments and
 * merchant refunds). Pure and in integer cents so the exact-match rule
 * is testable and identical everywhere it's shown or enforced. */

const toCents = (n: number) => Math.round(n * 100);

export interface CardSideTotals {
  /** Sum of positive lines, rounded to cents. */
  chargesLogged: number;
  /** Sum of negative lines as a POSITIVE number, rounded to cents --
   * mirrors how the statement prints its payments/credits total. */
  creditsLogged: number;
}

export function cardSideTotals(amounts: number[]): CardSideTotals {
  let charges = 0;
  let credits = 0;
  for (const a of amounts) {
    const cents = toCents(a);
    if (cents > 0) charges += cents;
    else credits -= cents;
  }
  return { chargesLogged: charges / 100, creditsLogged: credits / 100 };
}

export function cardSideMatches(logged: number, target: number): boolean {
  return toCents(logged) === toCents(target);
}

/** null = both sides match exactly; otherwise one human sentence naming
 * the side(s) that are off, for the reconcile error Banner. */
export function cardReconcileMismatch(
  totals: CardSideTotals,
  statementTotal: number,
  paymentsCreditsTotal: number
): string | null {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const chargesOff = !cardSideMatches(totals.chargesLogged, statementTotal);
  const creditsOff = !cardSideMatches(totals.creditsLogged, paymentsCreditsTotal);
  if (chargesOff && creditsOff) {
    return `Neither side matches yet: charges logged ${fmt(totals.chargesLogged)} vs ${fmt(statementTotal)} on the statement, payments & credits logged ${fmt(totals.creditsLogged)} vs ${fmt(paymentsCreditsTotal)}.`;
  }
  if (chargesOff) {
    return `Charges logged (${fmt(totals.chargesLogged)}) don't match the statement's charges total (${fmt(statementTotal)}) yet.`;
  }
  if (creditsOff) {
    return `Payments & credits logged (${fmt(totals.creditsLogged)}) don't match the statement's payments & credits total (${fmt(paymentsCreditsTotal)}) yet.`;
  }
  return null;
}
