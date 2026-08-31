import Link from "next/link";

/** Link-based tabs (not client state) — matches the existing Ledger/Reports
 * pattern of separate routes per tab. Active state uses functional primary,
 * not brand indigo: brand is reserved for the single most consequential
 * action per flow, and plain navigation chrome isn't that (2026-08-16
 * verification-pass decision). */
export function Tabs({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">{children}</div>;
}

export function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "px-3.5 py-2 rounded-[var(--radius-md)] font-medium transition-colors " +
        // Inactive tabs get a REAL border, not a transparent one
        // (2026-08-24, Oliver: "why do we have only one blue button box?").
        // Bare text next to one filled box read as labels, not tappable
        // options, on a phone -- same reasoning as the week view's day
        // tabs, which box every day and mark the active one by fill.
        (active
          ? "bg-[var(--primary)] text-white border border-[var(--primary)]"
          : "text-[var(--ink-700)] bg-[var(--card)] hover:bg-[var(--hover)] border border-[var(--border-strong)]")
      }
    >
      {children}
    </Link>
  );
}
