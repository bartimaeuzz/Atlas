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
 * instead of being split across two different spots. */
export function NavBarClient({ auth }: { auth: { name: string; systemRole: "STAFF" | "MANAGER" | "ADMIN" } | null }) {
  const pathname = usePathname();
  const isManager = auth?.systemRole === "MANAGER" || auth?.systemRole === "ADMIN";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close the menu automatically on navigation, so it doesn't stay open
  // hovering over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-8 py-3 flex items-center gap-6 text-sm">
        <Link href="/" className="font-semibold hover:text-neutral-600">
          Atlas
        </Link>
        <nav className="flex gap-4 flex-1">
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
    </header>
  );
}
