"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/shifts", label: "Shifts" },
  { href: "/employees", label: "Employees" },
  { href: "/positions", label: "Positions" },
  { href: "/schedule", label: "Schedule" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

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
 * token, to keep the client bundle from touching anything session-shaped. */
export function NavBarClient({ auth }: { auth: { name: string } | null }) {
  const pathname = usePathname();

  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-8 py-3 flex items-center gap-6 text-sm">
        <Link href="/" className="font-semibold hover:text-neutral-600">
          Atlas
        </Link>
        <nav className="flex gap-4 flex-1">
          {NAV_ITEMS.map((item) => {
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
          <div className="flex items-center gap-3">
            <Link
              href="/me"
              className={pathname === "/me" ? "font-medium text-black" : "text-neutral-500 hover:text-black"}
            >
              My Pay
            </Link>
            <span className="text-neutral-400">{auth.name}</span>
            <form action={logout}>
              <button type="submit" className="text-neutral-500 hover:text-black">
                Sign out
              </button>
            </form>
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
