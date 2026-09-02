/**
 * Two-tone role chip (2026-09-01, backlog round 4 item 4 — the one
 * display idea kept from the competitor check). Left half: which side of
 * the house, FOH or BOH, as a solid fill. Right half: what the person is
 * called — the free-text job title when one is set ("Head Bartender"),
 * else the primary position ("Server").
 *
 * Two colours total and the words carry the meaning, so a colour-blind
 * reader loses nothing (never colour-alone). FOH uses the app's primary;
 * BOH uses the slate ink — deliberately NOT a second hue, so the chip does
 * not compete with the success/warning/danger badges around it. Text on
 * the solid half is `--card` (white in light mode, dark slate in dark
 * mode) because the primary/ink tokens flip light in dark mode and white
 * text would fail contrast there.
 *
 * Renders nothing when there is neither a title nor a position, so
 * callers can drop it in without a guard.
 */

export type HouseSide = "FOH" | "BOH";

const sideClasses: Record<HouseSide, string> = {
  FOH: "bg-[var(--primary-700)] text-[var(--card)]",
  BOH: "bg-[var(--ink-700)] text-[var(--card)]",
};

export function RoleChip({
  side,
  title,
  positionName,
}: {
  /** Category of the primary position; null when no primary position. */
  side: HouseSide | null;
  title: string | null;
  positionName: string | null;
}) {
  const label = title?.trim() || positionName;
  if (!label) return null;
  return (
    <span className="inline-flex items-stretch whitespace-nowrap text-xs font-medium border border-[var(--primary-border)] rounded-[var(--radius-full)] overflow-hidden align-middle">
      {side && <span className={`px-2 py-1 ${sideClasses[side]}`}>{side}</span>}
      <span className="px-2.5 py-1 bg-[var(--primary-tint)] text-[var(--primary-700)]">{label}</span>
    </span>
  );
}
