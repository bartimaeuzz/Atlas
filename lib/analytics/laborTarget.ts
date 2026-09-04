/**
 * Pure labor-target types and helpers (2026-09-04) — no database import,
 * deliberately. WeeklyPlanGrid is a client component, so the moment the
 * verdict helper lived beside the loader it would have dragged db/client
 * into the browser bundle. The query half stays in loadDailyLabor.ts; this
 * half is shared by both sides.
 */

export interface DailyLabor {
  date: string;
  /** Net sales for the day — Toast net plus every platform's net, no tax,
   * no tips. Same figure the P&L calls revenue. */
  netSales: number;
  /** Employer labor spend for the day. Never includes tips. */
  laborCost: number;
  /** 0-1 share of net sales, or null when the day had no sales — "nothing
   * to compare against" must render as an em dash, never as 0%. */
  laborPct: number | null;
  /** True when every shift that exists on this date is finalized. False
   * means the figures cover only the closed part of the day. */
  complete: boolean;
}

export type DailyLaborByDate = Record<string, DailyLabor>;

/** The three researched presets from the 25-35% full-service band already
 * cited by loadPnL.ts's laborCostPct benchmark. Order is the order the
 * Settings screen shows them in: tightest first, so the list reads as one
 * dial rather than three unrelated choices. */
export const LABOR_TARGET_PRESETS = [
  { value: 0.25, label: "Tight", hint: "Lean floor, little slack" },
  { value: 0.3, label: "Standard", hint: "The usual full-service figure" },
  { value: 0.35, label: "Generous", hint: "More cover, thinner margin" },
] as const;

/** Turns a stored target back into its preset word, or "Custom" for a
 * number nobody's preset matches. Kept next to the presets so the two can
 * never drift apart. */
export function laborTargetLabel(pct: number): string {
  const preset = LABOR_TARGET_PRESETS.find((p) => Math.abs(p.value - pct) < 1e-9);
  return preset ? preset.label : "Custom";
}

export type LaborVerdict = "over" | "under" | "none";

/** "none" whenever there is nothing honest to say: no target set, or no
 * sales to divide by. The UI must show the percentage without a colour in
 * that case rather than defaulting to a verdict. */
export function laborVerdict(laborPct: number | null, targetPct: number | null | undefined): LaborVerdict {
  if (laborPct == null || targetPct == null) return "none";
  return laborPct > targetPct ? "over" : "under";
}
