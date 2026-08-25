/** Soft plausibility check for a card transaction's date against its
 * statement period (2026-08-25, P&L-precision pass). The date on a line
 * must be the TRANSACTION date printed on the statement -- that's what
 * the Analytics/P&L expense breakdown buckets by -- and two shapes are
 * almost always a typo or a misread:
 *
 *   - after periodEnd: a charge made after the statement closed can't be
 *     on this statement (it belongs to the next one);
 *   - far before periodStart: a charge a few days before the period
 *     opens legitimately posts into it, but 45+ days early means a wrong
 *     month or year was typed.
 *
 * Warning only, never a block -- statements occasionally carry genuinely
 * odd dates (late-posting disputes, annual-fee reversals), and the house
 * rule is error prevention over hard errors on correct data. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EARLY_GRACE_DAYS = 45;

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** null = fine (including empty/partial input -- the field's `required`
 * handles emptiness; don't warn mid-typing). */
export function transactionDateWarning(date: string, periodStart: string, periodEnd: string): string | null {
  if (!ISO_DATE.test(date) || !ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) return null;
  if (date > periodEnd) {
    return `This date is after the statement period ends (${periodEnd}). A charge made after that day appears on the next statement, not this one.`;
  }
  if (date < minusDays(periodStart, EARLY_GRACE_DAYS)) {
    return `This date is more than 6 weeks before the statement period starts (${periodStart}). Double-check it against the printed line.`;
  }
  return null;
}
