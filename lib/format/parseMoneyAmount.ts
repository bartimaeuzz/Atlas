import { ungroupThousands } from "./groupThousands";

/** The one place a dollar figure TYPED BY A PERSON becomes a number
 * (2026-09-05, the money-comma rollout).
 *
 * Every money box in the app now shows a thousands separator while it is
 * not being typed in — see components/ui/MoneyInput.tsx. A field that
 * posts through FormData posts what it is DISPLAYING, so "18,500" is what
 * arrives at the action. The bare `Number(raw)` those actions used to do
 * returns NaN for that, and the manager is told "Amount must be a positive
 * number" with a perfectly good number on the screen in front of them.
 * That is why the parsers had to be widened BEFORE any field grew a comma.
 *
 * What it accepts, and why each one:
 *   "$"          managers type the dollar sign as readily as not.
 *   ","          the separator the field itself just put there.
 *   whitespace   pasted from a spreadsheet cell.
 *
 * What it does NOT do is guess. A blank field, a stray letter, an empty
 * string — all come back NaN, and the CALLER decides what that means,
 * because the callers disagree: a petty-cash amount must be positive, a
 * card transaction may be negative (a refund), and a statement's
 * payments/credits total may legitimately be zero. Rejecting here would
 * flatten three different sentences into one wrong one.
 *
 * It rounds to cents. `type="number" step="0.01"` used to make the browser
 * refuse a third decimal place; a text box with a comma in it cannot, so
 * the guard moves here rather than disappearing. This mirrors what
 * lib/actions/salesTargets.ts has done since it was written — this
 * function is that parser's arithmetic, lifted out so eight actions share
 * one definition of "what the manager typed" instead of eight.
 */
export function parseMoneyAmount(raw: unknown): number {
  if (raw == null) return NaN;
  const cleaned = ungroupThousands(String(raw).replace(/[$\s]/g, ""));
  if (cleaned === "") return NaN;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100) / 100;
}
