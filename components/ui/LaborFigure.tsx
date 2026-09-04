import type { DailyLabor, LaborVerdict } from "@/lib/analytics/laborTarget";
import { laborVerdict } from "@/lib/analytics/laborTarget";

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
 */
export function LaborFigure({
  day,
  targetPct,
  variant = "full",
  showAmounts = false,
}: {
  day: DailyLabor;
  targetPct: number | null | undefined;
  variant?: "full" | "compact";
  /** VIEW_PNL only. Revenue in dollars is withheld at the VIEW_ANALYTICS
   * tier everywhere else in this app (Analytics' Revenue chart passes
   * `showAmounts={canSeePnL}` for the same reason), and seven days of it
   * is a week of revenue — see lib/analytics/loadScheduleLabor.ts. */
  showAmounts?: boolean;
}) {
  const verdict: LaborVerdict = laborVerdict(day.laborPct, targetPct);
  const tone = verdict === "over" ? "text-[var(--danger-700)] font-medium" : "text-[var(--ink-500)]";
  const pct = day.laborPct == null ? null : Math.round(day.laborPct * 100);

  // Screen readers get the whole sentence once; the visible text is the
  // shorthand. Without this the compact form reads as a bare "28%" with no
  // idea what it is a percentage of.
  const spoken =
    (pct == null ? "No sales" : `Labor ${pct} percent of sales`) +
    (verdict === "over" ? ", over target" : "") +
    (day.complete ? "" : ", day not fully closed yet");

  if (variant === "compact") {
    return (
      <div className={"text-xs leading-tight " + tone}>
        <span aria-hidden="true">
          {pct == null ? "—" : `${pct}%`}
          {verdict === "over" && <span className="ml-0.5">!</span>}
          {!day.complete && <span className="ml-0.5 opacity-70">*</span>}
        </span>
        <span className="sr-only">{spoken}</span>
      </div>
    );
  }

  return (
    <div className={"text-xs font-normal leading-tight " + tone}>
      <span aria-hidden="true">
        {showAmounts && <>{formatMoney(day.netSales)} · </>}
        {pct == null ? "Labor —" : <>Labor {pct}%</>}
        {verdict === "over" && <> over</>}
        {!day.complete && <> · so far</>}
      </span>
      <span className="sr-only">
        {showAmounts ? `${formatMoney(day.netSales)} sales. ` : ""}
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
