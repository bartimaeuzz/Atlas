/**
 * Chart color palette for the Analytics/P&L page (2026-08-16) — the
 * documented default categorical + status palette from the dataviz
 * skill (references/palette.md), validated with
 * `scripts/validate_palette.js` before use (all six checks pass; three
 * light-mode slots carry a contrast WARN that's mitigated here by every
 * bar always having a direct text label right beside it — never color
 * alone). Light mode only, matching the rest of Atlas (no dark mode
 * anywhere else in the app).
 *
 * Categorical slots are assigned in this FIXED order and never cycled
 * or reassigned by value — Toast/Food always lands on slot 1, etc., so
 * a color always means the same channel/category across page loads.
 */
export const CATEGORICAL_SLOTS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

/** Status palette (fixed, reserved — never reused as a categorical
 * slot). Used only on the benchmarked KPI meters below, always paired
 * with an icon + label, never color alone. */
export const STATUS_COLORS = {
  good: "#0ca30c",
  warning: "#fab219",
  neutral: "#8c8b84", // "not applicable" / no benchmark -- a step of chart-furniture gray, not a status color
} as const;

export function categoricalSlot(index: number): string {
  return CATEGORICAL_SLOTS[index % CATEGORICAL_SLOTS.length];
}
