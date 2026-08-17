import { STATUS_COLORS } from "./palette";
import type { Benchmark } from "@/lib/analytics/loadPnL";

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
 */
export function KpiMeterCard({ benchmark }: { benchmark: Benchmark }) {
  const pct = Math.max(0, Math.min(1, benchmark.value));
  const color =
    benchmark.status === "in_range"
      ? STATUS_COLORS.good
      : benchmark.status === "not_applicable"
        ? STATUS_COLORS.neutral
        : STATUS_COLORS.warning;
  const icon = benchmark.status === "in_range" ? "✓" : benchmark.status === "not_applicable" ? "–" : "⚠";

  return (
    <div className="border rounded p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium text-neutral-700">{benchmark.label}</h3>
        <span className="text-xl font-semibold tabular-nums" style={{ color }}>
          {(benchmark.value * 100).toFixed(1)}%
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color }}>
        <span aria-hidden="true">{icon}</span>
        <span className="font-medium">{STATUS_LABEL[benchmark.status]}</span>
      </div>

      <div className="relative h-2 rounded-full bg-neutral-100 overflow-hidden mb-2">
        {benchmark.goodRangeLow != null && benchmark.goodRangeHigh != null && (
          <div
            className="absolute inset-y-0 bg-neutral-200"
            style={{
              left: `${Math.min(100, benchmark.goodRangeLow * 100)}%`,
              width: `${Math.max(0, Math.min(100, benchmark.goodRangeHigh * 100) - Math.min(100, benchmark.goodRangeLow * 100))}%`,
            }}
            title={`Healthy range: ${(benchmark.goodRangeLow * 100).toFixed(0)}-${(benchmark.goodRangeHigh * 100).toFixed(0)}%`}
          />
        )}
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }} />
      </div>

      <p className="text-xs text-neutral-400 leading-snug">{benchmark.note}</p>
      <p className="text-[10px] text-neutral-300 mt-1">Source: {benchmark.source}</p>
    </div>
  );
}
