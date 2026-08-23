import { weekdayOf } from "@/lib/format/formatDayLabel";

/** Weekday-prefixed date for COLUMN contexts — a table cell, a card row,
 * anywhere dates stack vertically and the eye scans down them.
 *
 * Why this exists (2026-08-22, Oliver: "the output is not beautifully
 * straight between rows"). `formatDayLabel` returns a plain string, and a
 * proportional typeface renders the three-letter weekdays at wildly
 * different widths — measured on the live table: "Fri" 17.57px, "Sat"
 * 21.58px, "Tue" 24.39px, "Sun" 25.57px, "Thu" 25.84px, "Wed" 30.02px,
 * "Mon" 30.58px. Across eight rows the date after it began at SEVEN
 * different x-positions, a 13px spread. Type does not align words unless
 * it is told to.
 *
 * Three things make the column straight:
 *   1. The weekday sits in a fixed-width box. The width is in `em`, not
 *      px, so it holds at every font size this renders at — a px width
 *      would silently break the moment the label appeared at 16px.
 *   2. The date gets tabular figures, so the digits stack too.
 *   3. The weekday is muted. It is a label ON the date, not part of it,
 *      and that separation is most of what makes a date column scannable
 *      — which was the point of adding weekdays in the first place.
 *
 * NOT for inline prose. In a sentence ("Sat 2026-08-01 to Mon
 * 2026-08-31") the fixed-width box opens a visible gap mid-sentence —
 * there is no column to align to, so use `formatDayLabel` there instead.
 */
export function DayLabel({ iso, className = "" }: { iso: string; className?: string }) {
  const weekday = weekdayOf(iso);
  if (!weekday) return <span className={className}>{iso}</span>;
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span className="inline-block w-[2.6em] font-normal text-[var(--ink-500)]">{weekday}</span>
      <span className="tabular-nums">{iso}</span>
    </span>
  );
}
