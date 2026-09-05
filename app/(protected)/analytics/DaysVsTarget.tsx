import { WeatherFigure } from "@/components/ui/WeatherFigure";
import { loadDailyNetSales } from "@/lib/analytics/loadDailyNetSales";
import { loadSalesTargets } from "@/lib/analytics/loadSalesTargets";
import { resolveSalesTarget, salesDifference, salesVerdict } from "@/lib/analytics/salesTarget";
import {
  loadWeatherRecordsForRange,
  loadWeatherUnit,
  mergeDayWeather,
  type WeatherRecord,
} from "@/lib/weather/loadWeather";

/** "Which days missed, and what the weather was doing" (2026-09-05, Oliver:
 * build-queue item 12 — weather as a P&L explainer, not an icon).
 *
 * The whole design of this table is the adjacency: the miss and its most
 * likely reason on one line. Sales variance already existed on the schedule
 * and on each closing report, but a manager asking "why was last week down"
 * was reading seven separate pages to find out.
 *
 * VIEW_PNL only — every column but the weather is revenue in dollars, and
 * the caller gates it, not this component.
 *
 * Rules carried over from LaborFigure so the two never disagree on screen:
 * "beat" and "short", never "over" and "under" (labor's "over" means the
 * opposite kind of news); only the miss is coloured, because painting the
 * good days makes the bad one harder to find; and a day still half-open
 * gets no verdict at all, since a figure that will move by close is true
 * and useless.
 */

/** A year of rows is a wall, not a report. The most recent month is what a
 * manager acts on; the note under the table says what was left out rather
 * than silently truncating. */
const MAX_ROWS = 31;

/** One row's verdict, computed once and read by both the phone cards and the
 * desktop table — two renderers of the same figures that must not drift into
 * judging a day differently.
 *
 * `netSales > 0` is the guard `LaborFigure` already applies to this same
 * data, and it is here for the same reason: a closed day showing $0 is
 * almost always a shift finalized before its sales were entered, and
 * "Short by $15,000" states as fact something nobody measured. Seen live on
 * production 2026-09-05 (Tue Aug 11). The target is still shown — there is
 * simply no verdict attached to it. */
function judge(day: { netSales: number; complete: boolean }, target: number | null) {
  const judgeable = target != null && day.complete && day.netSales > 0;
  const verdict = judgeable ? salesVerdict(day.netSales, target) : "none";
  const diff = judgeable ? salesDifference(day.netSales, target) : null;
  return {
    missed: verdict === "under",
    text:
      target == null
        ? "No target set"
        : diff == null
          ? `Target ${formatDollars(target)}`
          : verdict === "under"
            ? `Short by ${formatDollars(Math.abs(diff))}`
            : `Beat by ${formatDollars(Math.abs(diff))}`,
  };
}

export async function DaysVsTarget({ from, to }: { from: string; to: string }) {
  const [daily, targets, weatherRows, unit] = await Promise.all([
    loadDailyNetSales(from, to),
    loadSalesTargets(),
    loadWeatherRecordsForRange(from, to),
    loadWeatherUnit(),
  ]);

  const weatherByDay = new Map<string, WeatherRecord[]>();
  for (const record of weatherRows.values()) {
    if (!weatherByDay.has(record.date)) weatherByDay.set(record.date, []);
    weatherByDay.get(record.date)!.push(record);
  }

  const allDays = Object.values(daily.byDate).sort((a, b) => b.date.localeCompare(a.date));
  if (allDays.length === 0) return null;
  const days = allDays.slice(0, MAX_ROWS);

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-[var(--ink-900)] mb-3">Days against target</h2>
      {/* Cards on a phone, table on a wide screen (2026-09-05 live audit).
          The table version was measured on production at 390px: the content
          column is 308px against a 480px table, so the Weather column began
          at x=427 and was entirely off screen — the one column this feature
          exists for, invisible on the device a manager actually carries,
          behind a sideways scroll with no affordance that it was there.

          `lg:`, not `sm:`, per the charter: the nav rail costs 216px, so a
          640px viewport breakpoint is really a ~360px content breakpoint.
          Same swap point Table.tsx already uses. */}
      <ul className="lg:hidden space-y-2">
        {days.map((day) => {
          const target = resolveSalesTarget(day.date, targets);
          const { missed, text } = judge(day, target);
          const weather = mergeDayWeather(weatherByDay.get(day.date) ?? []);
          return (
            <li
              key={day.date}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-[var(--ink-900)]">{dayLabel(day.date)}</span>
                <span className="text-sm font-medium text-[var(--ink-900)]">
                  {formatDollars(day.netSales)}
                  {!day.complete && (
                    <span className="ml-1 text-xs font-normal text-[var(--ink-500)]">so far</span>
                  )}
                </span>
              </div>
              <p
                className={
                  "mt-0.5 text-xs " +
                  (missed ? "text-[var(--danger-700)] font-medium" : "text-[var(--ink-500)]")
                }
              >
                {text}
              </p>
              {weather && (
                <div className="mt-1">
                  <WeatherFigure weather={weather} variant="detail" unit={unit} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden lg:block overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[30rem] text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--ink-500)] border-b border-[var(--border)]">
              <th className="py-2 px-3 font-medium">Day</th>
              <th className="py-2 px-3 font-medium text-right">Net sales</th>
              <th className="py-2 px-3 font-medium">Against target</th>
              <th className="py-2 px-3 font-medium">Weather</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const target = resolveSalesTarget(day.date, targets);
              const { missed, text } = judge(day, target);
              const weather = mergeDayWeather(weatherByDay.get(day.date) ?? []);
              return (
                <tr key={day.date} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="py-2 px-3 text-[var(--ink-900)] whitespace-nowrap">{dayLabel(day.date)}</td>
                  <td className="py-2 px-3 text-right text-[var(--ink-900)] whitespace-nowrap">
                    {formatDollars(day.netSales)}
                    {!day.complete && <span className="ml-1 text-xs text-[var(--ink-500)]">so far</span>}
                  </td>
                  <td
                    className={
                      "py-2 px-3 whitespace-nowrap " +
                      (missed ? "text-[var(--danger-700)] font-medium" : "text-[var(--ink-500)]")
                    }
                  >
                    {text}
                  </td>
                  <td className="py-2 px-3">
                    {weather ? (
                      <WeatherFigure weather={weather} variant="detail" unit={unit} />
                    ) : (
                      <span className="text-xs text-[var(--ink-500)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-500)]">
        {allDays.length > MAX_ROWS
          ? `Showing the ${MAX_ROWS} most recent closed days of ${allDays.length}. Narrow the dates above to see the rest. `
          : ""}
        Weather is what was recorded when each shift was closed. Days closed before your location was
        set show a dash — fill them in from Settings.
      </p>
    </section>
  );
}

/** "Sat 13 Sep". Pinned to UTC noon and formatted in UTC — a bare ISO date
 * parses as the previous day in every timezone this app runs in. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}
