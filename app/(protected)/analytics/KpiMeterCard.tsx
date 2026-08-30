import { STATUS_COLORS } from "./palette";
import { Card } from "@/components/ui/Card";
import type { Benchmark } from "@/lib/analytics/loadPnL";
import { formatShare } from "@/lib/analytics/formatShare";

const STATUS_LABEL: Record<Benchmark["status"], string> = {
  in_range: "In range",
  below_range: "Below range",
  above_range: "Above range",
  not_applicable: "Not benchmarked",
};

/**
 * A single benchmarked KPI — "a single ratio against a limit" is a
 * Meter per the dataviz skill's form guidance, not a chart: the fill
 * carries status (good/warning), the unfilled track is a lighter step
 * of the same neutral, and status color always ships with an icon +
 * label, never alone (the skill's status-color rule). The good-range
 * band is drawn as a faint marker on the track so the fill's position
 * relative to "healthy" is visible at a glance, not just implied by
 * color.
 *
 * Design-system-v2 retrofit (2026-08-21): card chrome and non-status
 * text now use the shared `Card` component and `--ink-*`/`--paper`/
 * `--border-strong` tokens. `STATUS_COLORS` (the fill/status color
 * itself) is the dataviz-skill-validated status palette and is
 * deliberately NOT part of this token retrofit.
 */
export function KpiMeterCard({ benchmark }: { benchmark: Benchmark }) {
  const pct = Math.max(0, Math.min(1, benchmark.value));

  /* 2026-08-21 visual-audit fix: this used to warn on ANY out-of-band
   * value, so a page whose own copy says "Above 8% is great, not a
   * warning sign" still showed an amber warning glyph on a 78.7% net
   * margin -- 4 of 4 warnings on the live page were false alarms.
   * Crying wolf on good news is exactly what trains a manager to
   * ignore the one warning that matters (Nielsen #1, visibility of
   * system status: the signal has to mean something). Warning styling
   * is now reserved for a deviation on the metric's actual concern
   * side; a deviation the other way reads as informational -- still
   * labelled "Above range"/"Below range" so the fact is not hidden,
   * just not alarm-coded. */
  const isConcern =
    (benchmark.status === "above_range" && benchmark.concernDirection === "above") ||
    (benchmark.status === "below_range" && benchmark.concernDirection === "below");
  const isDeviation = benchmark.status === "above_range" || benchmark.status === "below_range";

  const color =
    benchmark.status === "in_range"
      ? STATUS_COLORS.good
      : isConcern
        ? STATUS_COLORS.warning
        : STATUS_COLORS.neutral;
  const icon = benchmark.status === "in_range" ? "✓" : isConcern ? "⚠" : isDeviation ? "ℹ" : "–";

  return (
    <Card>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium text-[var(--ink-700)]">{benchmark.label}</h3>
        {/* Shared with the P&L table's column (2026-08-30) so one ratio can
            never read "<0.1%" in the table and "0.0%" on the card above it.
            benchmark.value is always a number here, so the em-dash branch is
            unreachable from this caller -- that branch is the table's. */}
        <span className="text-xl font-semibold tabular-nums" style={{ color }}>
          {formatShare(benchmark.value)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color }}>
        <span aria-hidden="true">{icon}</span>
        <span className="font-medium">{STATUS_LABEL[benchmark.status]}</span>
      </div>

      <div className="relative h-2 rounded-full bg-[var(--paper)] overflow-hidden mb-2">
        {benchmark.goodRangeLow != null && benchmark.goodRangeHigh != null && (
          <div
            className="absolute inset-y-0 bg-[var(--border-strong)]"
            style={{
              left: `${Math.min(100, benchmark.goodRangeLow * 100)}%`,
              width: `${Math.max(0, Math.min(100, benchmark.goodRangeHigh * 100) - Math.min(100, benchmark.goodRangeLow * 100))}%`,
            }}
            title={`Healthy range: ${(benchmark.goodRangeLow * 100).toFixed(0)}-${(benchmark.goodRangeHigh * 100).toFixed(0)}%`}
          />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }} />
      </div>

      <p className="text-xs text-[var(--ink-500)] leading-snug">{benchmark.note}</p>
      <p className="text-[10px] text-[var(--ink-400)] mt-1">Source: {benchmark.source}</p>
    </Card>
  );
}
