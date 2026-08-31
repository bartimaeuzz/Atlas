import Link from "next/link";

const STAGES = [
  { key: "roster", label: "Roster", path: "roster" },
  { key: "closing", label: "Closing Report", path: "closing-report" },
  { key: "payout", label: "Payout", path: "preview" },
] as const;

export type ShiftStage = (typeof STAGES)[number]["key"];

/** The shift's three stages as a persistent, directly-clickable strip
 * (2026-08-25, Oliver: after saving the report you shouldn't have to
 * walk roster -> closing report -> Save & Preview again just to see the
 * payout -- "agreed" to nav-over-new-page). Every stage is reachable
 * from every other; the Payout link is /preview, which computes live on
 * a draft and redirects to the locked Summary once finalized, so this
 * one strip is correct in both states. The current stage is text, not a
 * link that reloads its own page. */
export function ShiftStageNav({ shiftId, current }: { shiftId: number; current: ShiftStage }) {
  return (
    <nav aria-label="Shift stages" className="flex flex-wrap items-center gap-1 mb-6 text-sm">
      {STAGES.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          {i > 0 && <span className="text-[var(--ink-400)] px-0.5">→</span>}
          {s.key === current ? (
            <span
              aria-current="page"
              className="inline-flex items-center min-h-9 px-2.5 rounded-[var(--radius-full)] bg-[var(--primary-tint)] border border-[var(--primary-border)] text-[var(--primary-700)] font-medium"
            >
              {s.label}
            </span>
          ) : (
            <Link
              href={`/shifts/${shiftId}/${s.path}`}
              className="inline-flex items-center min-h-9 px-2.5 rounded-[var(--radius-full)] border border-[var(--border)] text-[var(--ink-700)] hover:bg-[var(--hover)] hover:text-[var(--ink-900)]"
            >
              {s.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
