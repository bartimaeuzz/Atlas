"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { MenuIcon } from "@/components/ui/icons";

const MANAGER_NAV_ITEMS = [
  { href: "/shifts", label: "Shifts" },
  { href: "/people", label: "People" },
  { href: "/positions", label: "Positions" },
  { href: "/schedule", label: "Schedule" },
  { href: "/ledger", label: "Ledger" },
  { href: "/reports", label: "Reports" },
  { href: "/analytics", label: "Analytics" },
  { href: "/payroll", label: "Payroll" },
  { href: "/settings", label: "Settings" },
];

/** Red-pill badge — a bare dot when the count fits inline next to a
 * short label, with the number itself only shown once it's ambiguous
 * (>9). Kept tiny and absolutely positioned so it doesn't push the nav
 * item's own text/layout around. Restyled onto the danger token during
 * the design-system-v2 merge (2026-08-17) — was raw bg-red-500. */
function UnseenBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-[var(--radius-full)] bg-[var(--danger)] text-white text-[10px] font-medium leading-none align-middle"
      aria-label={`${count} unseen ${count === 1 ? "schedule item" : "schedule items"}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Persistent top nav, always visible — added 2026-08-10 after Oliver
 * pointed out several pages (New Shift, New/Edit Position, Settings, the
 * playground calculator) had no way back except editing the URL bar by
 * hand. This alone fixes that for every page in the app, since it's in
 * the root layout, not per-page. Active section is highlighted so it also
 * answers "where am I" while navigating deep into a shift.
 *
 * Split into NavBar (server, reads the session cookie) + this client
 * component (2026-08-10, staff login round) — usePathname needs a client
 * component, but resolving the session cookie needs a server one; the
 * server wrapper passes down just a display name, never the raw session
 * token, to keep the client bundle from touching anything session-shaped.
 *
 * Role-aware nav (2026-08-14) — the manager pages are gated server-side,
 * so a STAFF account sees the reduced nav entirely, not a bounce-to-login.
 *
 * "Me menu" (2026-08-14) — collapsed into one avatar with a dropdown
 * (My Schedule / My Pay / Sign out).
 *
 * Hamburger menu on phone width (2026-08-15) — below `sm` the inline row
 * is replaced with a hamburger-triggered stacked list.
 *
 * Red-pill unseen badge (2026-08-16, extended later same day for swap
 * requests) — `unseenScheduleCount` is resolved server-side in
 * NavBar.tsx (needs DB reads across leave + swap requests) and passed
 * down here as a number. Rendered on the "Schedule" nav item only, in
 * both the desktop row and the hamburger list.
 *
 * Restyled onto the design-system tokens (2026-08-16, `design-system-v2`,
 * merged into main 2026-08-17): "Atlas" wordmark uses the brand indigo
 * color (a styled text wordmark, not an icon mark), the avatar uses the
 * shared <Avatar> component (functional primary blue, not the old
 * hardcoded black), and every hardcoded neutral/border class is now a
 * semantic var(). The unseen-badge feature (shipped on `main` after the
 * design branch forked) is preserved here, just restyled onto the danger
 * token instead of raw red. Behavior is otherwise unchanged: role-aware
 * nav, hamburger below `sm`, me-menu, click-outside/pathname close. */
export function NavBarClient({
  auth,
  unseenScheduleCount = 0,
}: {
  auth: { name: string; systemRole: "STAFF" | "MANAGER" | "ADMIN" } | null;
  unseenScheduleCount?: number;
}) {
  const pathname = usePathname();
  const isManager = auth?.systemRole === "MANAGER" || auth?.systemRole === "ADMIN";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)] sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-6 text-sm">
        {isManager && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={mobileNavOpen}
            className="sm:hidden w-10 h-10 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--paper)] -ml-1 text-[var(--ink-700)]"
          >
            <MenuIcon />
          </button>
        )}
        <Link href="/" className="font-bold text-[var(--brand)] hover:text-[var(--brand-700)] tracking-tight">
          Atlas
        </Link>
        <nav className="hidden sm:flex gap-4 flex-1">
          {isManager &&
            MANAGER_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "font-medium " + (isActive ? "text-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-900)]")
                  }
                >
                  {item.label}
                  {item.href === "/schedule" && <UnseenBadge count={unseenScheduleCount} />}
                </Link>
              );
            })}
        </nav>
        <div className="flex-1 sm:hidden" />
        {auth ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`${auth.name} — account menu`}
              aria-expanded={menuOpen}
              className="hover:opacity-90 transition-opacity"
            >
              <Avatar name={auth.name} size={36} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-2)] py-1 text-sm">
                <div className="px-3 py-2 border-b border-[var(--border)]">
                  <p className="font-medium truncate text-[var(--ink-900)]">{auth.name}</p>
                  <p className="text-xs text-[var(--ink-500)]">{auth.systemRole === "STAFF" ? "Staff" : "Manager"}</p>
                </div>
                <Link
                  href="/me/schedule"
                  className={
                    "block px-3 py-2.5 " +
                    (pathname.startsWith("/me/schedule")
                      ? "font-medium text-[var(--ink-900)]"
                      : "text-[var(--ink-700)] hover:bg-[var(--paper)]")
                  }
                >
                  My Schedule
                </Link>
                <Link
                  href="/me"
                  className={
                    "block px-3 py-2.5 " +
                    (pathname === "/me" ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-700)] hover:bg-[var(--paper)]")
                  }
                >
                  My Pay
                </Link>
                <form action={logout} className="border-t border-[var(--border)]">
                  <button type="submit" className="w-full text-left px-3 py-2.5 text-[var(--ink-700)] hover:bg-[var(--paper)]">
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className={pathname === "/login" ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-900)]"}
          >
            Staff Login
          </Link>
        )}
      </div>
      {isManager && mobileNavOpen && (
        <nav className="sm:hidden border-t border-[var(--border)] bg-[var(--card)] px-4 py-2 flex flex-col">
          {MANAGER_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-1 py-3 text-base " +
                  (isActive ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-500)] hover:text-[var(--ink-900)]")
                }
              >
                {item.label}
                {item.href === "/schedule" && <UnseenBadge count={unseenScheduleCount} />}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
