"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A whole-row-clickable day row (2026-08-22, Oliver: "the whole row should
 * be clickable link like card on mobile viewport" — the phone card has been
 * one big <Link> since it was built, while on desktop only the date text
 * was clickable; his own DevTools capture showed `Keyboard-focusable 🚫` on
 * the cell).
 *
 * WHY THIS IS A CLICK HANDLER AND NOT A LINK WRAPPING THE ROW. HTML does
 * not allow an <a> around a <tr>, and the alternatives are worse than they
 * look: a link in every cell makes five tab stops per row, and the
 * stretched-pseudo-element trick relies on `position: relative` on a <tr>,
 * which browsers treat inconsistently.
 *
 * So the row gets a mouse affordance and the real <a> inside the date cell
 * stays the keyboard affordance and the accessible name. Mouse users can
 * click anywhere; keyboard users get exactly one tab stop per row, landing
 * on a genuine link they can open in a new tab. Nothing here is the only
 * route to the page — remove the JavaScript and the link still works, which
 * is the test that matters.
 */
export function MonthRow({
  href,
  isToday,
  className = "",
  children,
}: {
  href: string;
  isToday: boolean;
  /** Extra row classes -- e.g. People dims retired rows. */
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        // Let a real click on the inner link (or a modified click meant for
        // a new tab) behave normally instead of double-navigating.
        const target = e.target as HTMLElement;
        // Any interactive child keeps its own behaviour -- the People rows
        // (2026-08-24) carry buttons and selects, not just links.
        if (target.closest("a, button, select, input, label")) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        router.push(href);
      }}
      className={
        "border-b border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--primary-tint)] " +
        (isToday ? "bg-[var(--warning-tint)] " : "") +
        className
      }
    >
      {children}
    </tr>
  );
}
