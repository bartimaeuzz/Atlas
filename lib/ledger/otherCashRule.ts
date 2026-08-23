/** Does this "anything else added" amount need a stated reason?
 *
 * Extracted 2026-08-22 because the rule was about to live in two places at
 * once — the server action that enforces it and the form that decides
 * whether to show the field. A money threshold duplicated across a
 * client/server boundary drifts silently: someone tunes one, and the form
 * either hides a field the action then demands, or demands one the action
 * does not want. One function, imported by both.
 *
 * The epsilon exists because the amount arrives from a number input as a
 * float. Exact `!== 0` would treat a rounding artefact as real added cash
 * and block the day on a reason nobody can give. Half a cent is below any
 * amount that can be entered meaningfully.
 *
 * Negative values count. Taking money OUT of the drawer via this field
 * needs explaining at least as much as putting it in.
 */
export const OTHER_CASH_EPSILON = 0.005;

export function requiresOtherCashReason(otherCash: number): boolean {
  if (!Number.isFinite(otherCash)) return false;
  return Math.abs(otherCash) > OTHER_CASH_EPSILON;
}
