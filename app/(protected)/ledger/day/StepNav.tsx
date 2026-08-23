import Link from "next/link";

/** Checkout-style step navigation (2026-08-22, Oliver: "as a payment
 * checkout process i think you cannot move through steps unless you already
 * click through all steps then you can jump back and forth as you like").
 *
 * Three states, and the distinction between the last two is the whole
 * point:
 *   - `here`    — the step being worked on.
 *   - `open`    — reached before, so freely clickable.
 *   - `locked`  — not reached yet. Rendered dashed rather than merely grey,
 *                 because plain grey reads as "broken" while a dashed
 *                 outline reads as "not yet".
 *
 * REACHED-NESS LIVES IN THE URL, alongside the step itself (`?step=2&seen=3`).
 * It has to persist somewhere, and the URL is the only place that survives
 * the refresh a manager may well do mid-shift — component state would
 * silently re-lock steps they had already been through. The worst a
 * hand-edited `seen` can do is unlock a step early, which is harmless: the
 * server actions enforce every real rule regardless of which step the UI
 * is showing.
 *
 * Reaching a step means pressing Next, NOT entering data — otherwise a day
 * with nothing spent could never get past step 1 and could never be
 * finalized.
 */
export const STEPS = [
  { n: 1, label: "Expenses" },
  { n: 2, label: "Cash" },
  { n: 3, label: "Finalize" },
] as const;

export function stepHref(date: string, step: number, seen: number) {
  return `/ledger/day?date=${date}&step=${step}&seen=${Math.max(seen, step)}`;
}

export function StepNav({ date, step, seen }: { date: string; step: number; seen: number }) {
  return (
    <nav aria-label="Close of day steps" className="flex items-center gap-1.5 flex-wrap mb-4 lg:hidden">
      {STEPS.map((s, i) => {
        const isHere = s.n === step;
        const isOpen = s.n <= seen;
        const label = `${s.n} · ${s.label}`;
        return (
          <span key={s.n} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true" className="text-[var(--ink-400)] text-xs">›</span>}
            {isHere ? (
              <span
                aria-current="step"
                className="px-2.5 py-1.5 rounded-[var(--radius-full)] text-xs font-semibold bg-[var(--primary)] text-white"
              >
                {label}
              </span>
            ) : isOpen ? (
              <Link
                href={stepHref(date, s.n, seen)}
                className="px-2.5 py-1.5 rounded-[var(--radius-full)] text-xs font-medium bg-[var(--primary-tint)] text-[var(--primary)] hover:bg-[var(--primary-border)]"
              >
                {label}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                title="Finish the step you're on first"
                className="px-2.5 py-1.5 rounded-[var(--radius-full)] text-xs font-medium text-[var(--ink-400)] border border-dashed border-[var(--border-strong)]"
              >
                {label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Section heading. On phone it is the only heading on screen; on desktop
 *  all three stack down one page, and the number is what keeps the two
 *  layouts describing the same process. */
export function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-500)] mt-6 mb-2 pb-1.5 border-b border-[var(--border)] first:mt-0">
      <span className="lg:inline hidden">{n} · </span>
      {children}
    </h2>
  );
}
