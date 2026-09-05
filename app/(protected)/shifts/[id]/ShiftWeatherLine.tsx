import { WeatherFigure } from "@/components/ui/WeatherFigure";
import { loadLiveWindowWeather, loadWeatherRecord, loadWeatherUnit } from "@/lib/weather/loadWeather";
import { describeServiceWindow, type ShiftPeriod } from "@/lib/weather/serviceWindow";

/** The weather for one service, on the shift's own pages (2026-09-05).
 *
 * Which weather it shows depends entirely on whether the shift is locked,
 * and the caption says which one the reader is looking at — that distinction
 * is the whole feature. A finalized shift shows the RECORD: what was saved
 * the moment it closed, unchanged since. An open shift shows the LIVE
 * reading, which is part observation and part forecast on a day still
 * running, and which is explicitly not saved yet.
 *
 * Renders nothing when there is no location, no record and no reachable
 * service. A closing report is a money screen; an empty weather box on it
 * would be a distraction with nothing to say.
 */
export async function ShiftWeatherLine({
  date,
  period,
  isFinalized,
}: {
  date: string;
  period: ShiftPeriod;
  isFinalized: boolean;
}) {
  const [record, unit] = await Promise.all([loadWeatherRecord(date, period), loadWeatherUnit()]);
  const weather = record ?? (isFinalized ? null : await loadLiveWindowWeather(date, period));
  if (!weather) return null;

  const window = describeServiceWindow(period);
  const service = `${period.toLowerCase()} service, ${window}`;
  // Three captions, not two. A backfilled row is just as true about the
  // weather and NOT true about the record — saying "recorded when this shift
  // was closed" over a row filled in from Settings weeks later would be a
  // false sentence printed on a locked payroll record.
  const caption = !record
    ? `${period} service, ${window} — saved with this report when you close the shift`
    : record.source === "LOCK"
      ? `Recorded when this shift was closed · ${service}`
      : `Filled in afterwards from Settings · ${service}`;

  return (
    <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <WeatherFigure weather={weather} variant="banner" unit={unit} />
      <p className="mt-1 text-xs text-[var(--ink-500)]">{caption}</p>
    </div>
  );
}
