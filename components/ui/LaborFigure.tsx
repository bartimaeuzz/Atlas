import type { DailyLabor, LaborVerdict } from "@/lib/analytics/laborTarget";
import { laborVerdict } from "@/lib/analytics/laborTarget";
import { salesDifference, salesVerdict } from "@/lib/analytics/salesTarget";

/** One day's labor % as it appears on the schedule (2026-09-04). Two
 * densities of the same figure so the week grid and the month calendar
 * cannot drift into saying it differently:
 *
 *   "full"    — the week grid's day header: "Labor 28%", and "$4,120 ·
 *               Labor 28%" for a viewer who may also see dollars.
 *   "compact" — "28%" alone, a month calendar cell being ~36px wide on a
 *               phone. Never carries dollars at any tier — there is no
 *               room — so the month view is the same for both. The month
 *               legend spells out what the number is, the same way it
 *               already keys the status badges.
 *
 * Colour never carries the verdict on its own. An over-target day gets the
 * word "over" next to the danger tone, because the 2026-09-04 audit found
 * this exact class of defect twice on this very screen (WCAG 1.4.1) and
 * fixing it by adding words is the convention this app now follows.
 * Under-target days get no colour at all — Oliver's note was "colour only
 * when over target", and painting five green days a week would make the
 * one red one harder to find, not easier.
 *
 * A day nobody has fully closed is marked "so far": the figures are real
 * but cover only the finalized half, and a number that will move must say
 * so rather than being quietly wrong for an evening.
 *
 * SALES TARGET (2026-09-04). When a target exists and the viewer may see
 * dollars, the same line says how the day did against it. Three rules,
 * each of which had an obvious wrong version:
 *
 *   - The words are "beat" and "short", never "over" and "under". Labor's
 *     own verdict on this exact line is "over", and it means the opposite
 *     kind of news. Two "over"s pointing in different directions on one
 *     line is a defect, not a saving of characters.
 *   - A day that is not fully closed gets the target stated and NO
 *     verdict. At 6pm with Dinner still open the day is genuinely "$1,700
 *     short", and saying so would be true and useless — it will be wrong
 *     by close. "so far" already tells the reader the figure moves.
 *   - Only the miss is coloured, matching Oliver's "colour only when over
 *     target" call for labor: painting the good days too makes the one
 *     that needs attention harder to find.
 */
export function LaborFigure({
  day,
  targetPct,
  variant = "full",
  showAmounts = false,
  salesTarget = null,
}: {
  day: DailyLabor;
  targetPct: number | null | undefined;
  variant?: "full" | "compact";
  /** VIEW_PNL only. Revenue in dollars is withheld at the VIEW_ANALYTICS
   * tier everywhere else in this app (Analytics' Revenue chart passes
   * `showAmounts={canSeePnL}` for the same reason), and seven days of it
   * is a week of revenue — see lib/analytics/loadScheduleLabor.ts. */
  showAmounts?: boolean;
  /** The day's net sales target in dollars, already resolved through the
   * date-override-then-weekday order. Null when nobody set one. Rendered
   * only when `showAmounts` is true: a target and a difference are dollar
   * figures about revenue and sit on the same side of the VIEW_PNL line
   * as the sales figure itself. */
  salesTarget?: number | null;
}) {
  const verdict: LaborVerdict = laborVerdict(day.laborPct, targetPct);
  // Weight lives entirely in `tone`. The base class list used to carry
  // font-normal, which cancelled the over-target font-medium outright --
  // measured live 2026-09-04, computed weight 400 on the 113% day. Same
  // Tailwind v4 source-order trap CLAUDE.md records; the fix is to stop
  // emitting both, not to reorder them.
  const tone =
    verdict === "over"
      ? "font-medium text-[var(--danger-700)]"
      : "font-normal text-[var(--ink-500)]";
  const pct = day.laborPct == null ? null : Math.round(day.laborPct * 100);

  // A verdict needs a target, permission to show dollars, a day that is
  // actually finished, and sales to judge. Miss any one of those and the
  // line either states the target plainly or says nothing — the same
  // "nothing honest to say" guard laborPct already uses for a day with no
  // sales to divide by.
  const targetAmount = variant === "full" && showAmounts ? (salesTarget ?? null) : null;
  const judgeable = targetAmount != null && day.complete && day.netSales > 0;
  const sales = judgeable ? salesVerdict(day.netSales, targetAmount) : "none";
  const diff = Math.abs(salesDifference(day.netSales, targetAmount) ?? 0);
  const salesSpoken =
    targetAmount == null
      ? ""
      : sales === "over"
        ? `Beat the ${formatMoney(targetAmount)} sales target by ${formatMoney(diff)}. `
        : sales === "under"
          ? `${formatMoney(diff)} short of the ${formatMoney(targetAmount)} sales target. `
          : `Sales target ${formatMoney(targetAmount)}. `;

  // Screen readers get the whole sentence once; the visible text is the
  // shorthand. Without this the compact form reads as a bare "28%" with no
  // idea what it is a percentage of.
  const spoken =
    (pct == null ? "No sales" : `Labor ${pct} percent of sales`) +
    (verdict === "over" ? ", over target" : "") +
    (day.complete ? "" : ", day not fully closed yet");

  if (variant === "compact") {
    return (
      <div className={"text-xs leading-tight tabular-nums " + tone}>
        {/* No margin before the marks. A three-digit day ("113%!") needs
            every pixel of a ~43px phone cell -- measured live 2026-09-04 at
            44px against 43 with a 2px gap in place, 1px over. The glyphs
            read fine tight against the number. */}
        <span aria-hidden="true">
          {pct == null ? "—" : `${pct}%`}
          {verdict === "over" && <span>!</span>}
          {!day.complete && <span className="opacity-70">*</span>}
        </span>
        <span className="sr-only">{spoken}</span>
      </div>
    );
  }

  return (
    <div className={"text-xs leading-tight tabular-nums " + tone}>
      <span aria-hidden="true">
        {showAmounts && <>{formatMoney(day.netSales)} · </>}
        {targetAmount != null && (
          <>
            {sales === "over" ? (
              <>beat target by {formatMoney(diff)}</>
            ) : sales === "under" ? (
              // Its own colour, not the line's: the parent tone belongs to
              // labor, and on a day that is both over on labor and short on
              // sales the two verdicts must not borrow each other's weight.
              <span className="font-medium text-[var(--danger-700)]">{formatMoney(diff)} short of target</span>
            ) : (
              <>target {formatMoney(targetAmount)}</>
            )}
            {" · "}
          </>
        )}
        {pct == null ? "Labor —" : <>Labor {pct}%</>}
        {verdict === "over" && <> over</>}
        {!day.complete && <> · so far</>}
      </span>
      <span className="sr-only">
        {showAmounts ? `${formatMoney(day.netSales)} sales. ` : ""}
        {salesSpoken}
        {spoken}.
      </span>
    </div>
  );
}

/** Whole dollars only. A day header has room for "$4,120" and not for
 * "$4,120.75", and the cent is noise at this altitude — the exact figure
 * lives on the closing report. */
function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
