import type { ReactNode, CSSProperties } from "react";

/** Shared data-table primitives (added 2026-08-22, Positions/Reports retrofit).
 *
 * Shape borrowed deliberately from Track 1 (Seth's app, core-peach-sigma):
 * the whole table lives inside ONE rounded, bordered card whose
 * `overflow-hidden` clips the rows to the radius, with the horizontal
 * scroll container nested INSIDE that card rather than wrapping it. That
 * nesting is the part worth copying — scroll on the outside would clip the
 * card's own border mid-scroll.
 *
 * Three things from Track 1 were deliberately NOT copied, and callers
 * should not reintroduce them:
 *   1. Money left-aligned without tabular figures. Use `numeric` on TD/TH —
 *      columns of digits only compare when the decimal points line up.
 *   2. No totals row. Atlas report tables carry a TFoot total; keep it.
 *   3. Table-plus-horizontal-scroll as the phone story. At 390px Track 1's
 *      table card measures 98px wide and scrolls sideways. Atlas pairs
 *      `TableCard` (desktop) with `StackedCard` (phone) instead — see
 *      Payroll's precedent, which this generalizes.
 *
 * BREAKPOINT: the swap happens at `lg` (1024px), NOT `sm` (640px).
 * Measured live 2026-08-22: at a 640px viewport the nav rail takes 216px
 * and the page padding another 64px, leaving a 360px content column — so
 * `sm:` handed a 640px "desktop" a 860px-wide table crammed into 360px,
 * scrolling sideways inside the card, at exactly the width where the
 * stacked cards that fit perfectly had just switched off. A viewport
 * breakpoint is not a content-width breakpoint whenever a persistent
 * sidebar is in the layout. Keep these two in sync — StackedCardList's
 * `lg:hidden` and TableCard's `hidden lg:block` are one decision.
 *
 * Standard usage:
 *   <StackedCardList>…</StackedCardList>   ← narrow, lg:hidden
 *   <TableCard>…</TableCard>               ← wide, hidden lg:block
 */

export function TableCard({
  children,
  className = "",
  desktopOnly = true,
}: {
  children: ReactNode;
  className?: string;
  /** Defaults to wide-viewports-only, because the narrow story is
   *  StackedCardList. Pass false only for a table narrow enough to read in
   *  a 278px content column (what a 390px phone actually leaves). */
  desktopOnly?: boolean;
  }) {
  return (
    <div
      className={
        (desktopOnly ? "hidden lg:block " : "") +
        `bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden ${className}`
      }
    >
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  const style: CSSProperties | undefined = minWidth ? { minWidth: `${minWidth}px` } : undefined;
  return (
    <table className="w-full text-sm border-collapse" style={style}>
      {children}
    </table>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--paper)] text-[var(--ink-500)] text-xs uppercase tracking-wide">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  className = "",
  dimmed,
}: {
  children: ReactNode;
  className?: string;
  /** Retired / inactive rows. Renders a muted text tone, NOT reduced
   *  opacity: --ink-700 at 60% over the card background computes to ~3.4:1
   *  contrast, under WCAG AA's 4.5:1 for body text. The visible "Retired"
   *  badge is what carries the signal — dimming was decoration costing
   *  legibility (2026-08-22 scrutinize pass). Never make this the only cue. */
  dimmed?: boolean;
}) {
  return (
    <tr className={`border-t border-[var(--border)] ${dimmed ? "bg-[var(--paper)]" : ""} ${className}`}>{children}</tr>
  );
}

export function TH({
  children,
  numeric,
  emphasis,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  emphasis?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`py-2 px-3 ${numeric ? "text-right" : "text-left"} ${emphasis ? "font-semibold" : "font-medium"} ${className}`}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  numeric,
  emphasis,
  muted,
  danger,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  /** Right-aligns and applies tabular figures. Use for every money/count column. */
  numeric?: boolean;
  emphasis?: boolean;
  muted?: boolean;
  danger?: boolean;
  className?: string;
  colSpan?: number;
}) {
  const tone = danger
    ? "text-[var(--danger-700)]"
    : muted
      ? "text-[var(--ink-500)]"
      : emphasis
        ? "text-[var(--ink-900)]"
        : "text-[var(--ink-700)]";
  return (
    <td
      colSpan={colSpan}
      className={`py-2 px-3 ${numeric ? "text-right tabular-nums" : ""} ${emphasis ? "font-semibold" : ""} ${tone} ${className}`}
    >
      {children}
    </td>
  );
}

/** Totals row. Heavier top border than a body row so the total reads as a
 *  summary rather than one more record. */
export function TFoot({ children }: { children: ReactNode }) {
  return (
    <tfoot className="bg-[var(--paper)] font-semibold text-[var(--ink-900)]">
      <tr className="border-t-2 border-[var(--border-strong)]">{children}</tr>
    </tfoot>
  );
}

/* ---------- Phone side ---------- */

export function StackedCardList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lg:hidden space-y-2 ${className}`}>{children}</div>;
}

export function StackedCard({
  title,
  trailing,
  children,
  dimmed,
  footer,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  dimmed?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div
      className={`border border-[var(--border)] rounded-[var(--radius-lg)] p-4 ${dimmed ? "bg-[var(--paper)]" : "bg-[var(--card)]"}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="font-semibold text-[var(--ink-900)]">{title}</span>
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>
      {children && <div className="space-y-1 text-xs">{children}</div>}
      {footer && <div className="mt-3 flex flex-wrap items-center gap-3">{footer}</div>}
    </div>
  );
}

/** One label/value pair inside a StackedCard. The label stays visible rather
 *  than being implied by column position — a phone card has no column header
 *  to fall back on. */
export function StackedField({
  label,
  value,
  numeric,
  danger,
}: {
  label: string;
  value: ReactNode;
  numeric?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--ink-500)]">{label}</span>
      <span
        className={`${numeric ? "tabular-nums" : ""} ${danger ? "text-[var(--danger-700)]" : "text-[var(--ink-700)]"} text-right`}
      >
        {value}
      </span>
    </div>
  );
}

/** Phone-side equivalent of TFoot — the summary card that closes a list. */
export function StackedTotal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-lg)] p-4 flex items-center justify-between gap-3">
      <span className="font-semibold text-[var(--ink-900)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--ink-900)]">{value}</span>
    </div>
  );
}
