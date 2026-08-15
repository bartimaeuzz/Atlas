"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions/auth";

const MANAGER_NAV_ITEMS = [
  { href: "/shifts", label: "Shifts" },
  { href: "/employees", label: "Employees" },
  { href: "/positions", label: "Positions" },
  { href: "/schedule", label: "Schedule" },
  { href: "/ledger", label: "Ledger" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

/** Initials shown on the avatar circle -- first letter of the first two
 * words in the name ("Nancy Suksawat" -> "NS", a single-word name like
 * "Aey" -> "A"). Deliberately simple, no attempt at Thai-name-specific
 * logic. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
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
 * Role-aware nav (2026-08-14) — the manager pages (Shifts/Employees/etc,
 * see lib/auth/guard.ts) are now actually gated server-side, so showing
 * those links to a STAFF account was misleading (click through, get
 * bounced to /login). A logged-in STAFF account sees the manager item
 * list replaced entirely; MANAGER/ADMIN accounts are unaffected there.
 *
 * "Me menu" (2026-08-14, later same day, Oliver's own ask) — the
 * separate always-visible name text + "My Pay" link + "Sign out" button
 * on the right are now collapsed into one circular initials avatar.
 * Clicking it opens a small dropdown with "My Schedule" (any signed-in
 * account — the route itself has no role check, it just shows whatever
 * that employee's own published schedule is) and "My Pay", then Sign
 * out. This also removes the old separate "My Schedule" link from the
 * STAFF-only left nav, since it now lives in the same menu as My Pay
 * instead of being split across two different spots.
 *
 * Hamburger menu on phone width (2026-08-15, accessibility audit fix) —
 * the 7-link manager row (MANAGER_NAV_ITEMS) doesn't fit a phone screen
 * and previously had no wrap/scroll fallback, so links would overflow
 * off-screen with no way to reach them. Below the `sm` breakpoint the
 * inline row is hidden and replaced with a hamburger button that opens
 * a stacked full-width link list instead; at `sm` and above the original
 * inline row is unchanged. */
export function NavBarClient({ auth }: { auth: { name: string; systemRole: "STAFF" | "MANAGER" | "ADMIN" } | null }) {
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

  // Close both menus automatically on navigation, so they don't stay open
  // hovering over the new page.
  useEffect(() => {
    setMenuOpen(false);
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-4 sm:gap-6 text-sm">
        {isManager && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={mobileNavOpen}
            className="sm:hidden w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-100 -ml-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Link href="/" className="font-semibold hover:text-neutral-600">
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
                  className={isActive ? "font-medium text-black" : "text-neutral-500 hover:text-black"}
                >
                  {item.label}
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
              className="w-8 h-8 rounded-full bg-black text-white text-xs font-medium flex items-center justify-center hover:bg-neutral-700 transition-colors"
            >
              {initialsFor(auth.name)}
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg py-1 text-sm">
                <div className="px-3 py-2 border-b">
                  <p className="font-medium truncate">{auth.name}</p>
                  <p className="text-xs text-neutral-500">{auth.systemRole === "STAFF" ? "Staff" : "Manager"}</p>
                </div>
                <Link
                  href="/me/schedule"
                  className={
                    "block px-3 py-2 " +
                    (pathname.startsWith("/me/schedule") ? "font-medium text-black" : "text-neutral-600 hover:bg-neutral-50")
                  }
                >
                  My Schedule
                </Link>
                <Link
                  href="/me"
                  className={
                    "block px-3 py-2 " +
                    (pathname === "/me" ? "font-medium text-black" : "text-neutral-600 hover:bg-neutral-50")
                  }
                >
                  My Pay
                </Link>
                <form action={logout} className="border-t">
                  <button type="submit" className="w-full text-left px-3 py-2 text-neutral-600 hover:bg-neutral-50">
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className={pathname === "/login" ? "font-medium text-black" : "text-neutral-500 hover:text-black"}
          >
            Staff Login
          </Link>
        )}
      </div>
      {isManager && mobileNavOpen && (
        <nav className="sm:hidden border-t bg-white px-4 py-2 flex flex-col">
          {MANAGER_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-1 py-2.5 text-base " +
                  (isActive ? "font-medium text-black" : "text-neutral-500 hover:text-black")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
