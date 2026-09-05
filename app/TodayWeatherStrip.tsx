import Link from "next/link";
import { WeatherFigure } from "@/components/ui/WeatherFigure";
import { loadForecastByDate, loadWeatherLocation } from "@/lib/weather/loadWeather";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadSalesTargets } from "@/lib/analytics/loadSalesTargets";
import { dayOfWeekFor, resolveSalesTarget, shiftDate } from "@/lib/analytics/salesTarget";

/** The first thing a manager sees after signing in (2026-09-05, Oliver:
 * item 8/12 plus "i want 1 to have a week forecast").
 *
 * Two rows doing two different jobs. Today's line answers "what am I walking
 * into" — the date, the sky, and what the day is supposed to do. The seven
 * columns under it answer the planning question item 12 was actually about:
 * which day this week needs an extra person and which one is going to be
 * quiet. Both are LIVE forecast and neither is stored — a forecast that got
 * it wrong is not a record of anything, and the record is written at lock
 * time instead (lib/weather/captureShiftWeather.ts).
 *
 * Renders NOTHING at all when no location is set, when the service is down,
 * or when the forecast comes back empty. A home page must not grow an empty
 * grey box because a weather server was slow. The one exception is the
 * manager who can actually fix it: they get a single quiet line pointing at
 * Settings, because "nothing happened and you can't tell why" is the worse
 * failure for the one person able to act on it.
 */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function TodayWeatherStrip({
  canSeeTargets,
  canEditSettings,
}: {
  /** VIEW_PNL. The target line is revenue in dollars and sits on the same
   * side of that line as every other dollar figure in the app. Loaded in
   * here rather than passed in, so awaiting it happens inside the Suspense
   * boundary instead of blocking the page that renders it. */
  canSeeTargets: boolean;
  canEditSettings: boolean;
}) {
  const location = await loadWeatherLocation();
  if (!location) {
    if (!canEditSettings) return null;
    return (
      <p className="mb-6 text-sm text-[var(--ink-500)]">
        Set your restaurant&apos;s town in{" "}
        <Link href="/settings" className="text-[var(--primary)] underline underline-offset-2">
          Settings
        </Link>{" "}
        to see the weather with your schedule.
      </p>
    );
  }

  const today = businessTodayIso();
  const lastDay = shiftDate(today, 6);
  const forecast = await loadForecastByDate(today, lastDay);
  if (forecast.size === 0) return null;

  const todayForecast = forecast.get(today) ?? null;
  const salesTargets = canSeeTargets ? await loadSalesTargets() : null;
  const target = salesTargets ? resolveSalesTarget(today, salesTargets) : null;
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));

  return (
    <section className="mb-6" aria-label="Today and the week ahead">
      {todayForecast && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div>
            <p className="text-xs text-[var(--ink-500)]">{longDate(today)}</p>
            {target != null && (
              <p className="mt-0.5 text-sm font-medium text-[var(--ink-900)]">
                Target {formatDollars(target)}
              </p>
            )}
          </div>
          <WeatherFigure weather={todayForecast} variant="banner" />
        </div>
      )}

      <div className="mt-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-2 py-2.5">
        <ul className="grid grid-cols-7 gap-1">
          {week.map((date) => {
            const day = forecast.get(date);
            const isToday = date === today;
            return (
              <li
                key={date}
                className={
                  "rounded-[var(--radius-sm)] py-1 text-center " +
                  (isToday ? "bg-[var(--warning-tint)]" : "")
                }
              >
                <span
                  className={
                    "block text-xs " +
                    (isToday ? "font-medium text-[var(--warning-700)]" : "text-[var(--ink-500)]")
                  }
                >
                  {isToday ? "Today" : DAY_NAMES[dayOfWeekFor(date)]}
                </span>
                {day ? (
                  <WeatherFigure weather={day} variant="column" className="mt-0.5" />
                ) : (
                  <span className="mt-0.5 block text-xs text-[var(--ink-500)]">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** "Saturday 13 September". Pinned to UTC noon and formatted in UTC, the
 * same convention every other ISO-date render in this app uses — a bare
 * "YYYY-MM-DD" parses as the previous day in every timezone Mohom runs in. */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDollars(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}
