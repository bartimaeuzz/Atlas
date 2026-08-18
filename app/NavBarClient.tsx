"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import {
  ShiftsIcon,
  PeopleIcon,
  PositionsIcon,
  ScheduleIcon,
  LedgerIcon,
  ReportsIcon,
  AnalyticsIcon,
  PayrollIcon,
  SettingsIcon,
  LoginIcon,
} from "@/components/ui/icons";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const MANAGER_NAV_ITEMS: { href: string; label: string; icon: IconType }[] = [
  { href: "/shifts", label: "Shifts", icon: ShiftsIcon },
  { href: "/people", label: "People", icon: PeopleIcon },
  { href: "/positions", label: "Positions", icon: PositionsIcon },
  { href: "/schedule", label: "Schedule", icon: ScheduleIcon },
  { href: "/ledger", label: "Ledger", icon: LedgerIcon },
  { href: "/reports", label: "Reports", icon: ReportsIcon },
  { href: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { href: "/payroll", label: "Payroll", icon: PayrollIcon },
];
const SETTINGS_ITEM: { href: string; label: string; icon: IconType } = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};

/** Red-pill badge — rendered twice per nav item (see NavItem below), one
 * copy per breakpoint, since the desktop sidebar shows it inline after
 * the label and the mobile rail (icon-only) shows it as a small corner
 * dot on the icon itself. A bare dot until the count is ambiguous (>9),
 * same convention as before the sidebar retrofit. */
function UnseenBadge({ count, corner }: { count: number; corner?: boolean }) {
  if (count <= 0) return null;
  const label = `${count} unseen ${count === 1 ? "schedule item" : "schedule items"}`;
  if (corner) {
    return (
      <span
        className="sm:hidden absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-[var(--radius-full)] bg-[var(--danger)] text-white text-[9px] font-medium leading-none"
        aria-label={label}
      >
        {count > 9 ? "9+" : count}
      </span>
    );
  }
  return (
    <span
      className="hidden sm:inline-flex ml-auto items-center justify-center min-w-[16px] h-[16px] px-1 rounded-[var(--radius-full)] bg-[var(--danger)] text-white text-[10px] font-medium leading-none align-middle"
      aria-label={label}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** One nav row. Desktop sidebar (>= sm): icon + visible text label, full
 * width. Mobile rail (< sm): icon only, 44x44 tap target (Apple's
 * comfortable-use minimum — confirmed with Oliver 2026-08-18 as the
 * floor, no further collapsing/trimming) centered in the 48px rail,
 * with an aria-label carrying the name for screen readers. This is a
 * deliberate, confirmed exception to the icon+visible-label rule
 * elsewhere in the app (see project_atlas_ui_design memory) — a
 * persistent always-visible rail is a different risk profile than the
 * hover-only title= tooltips that rule exists to stop. */
function NavItem({
  href,
  label,
  Icon,
  badgeCount,
  active,
}: {
  href: string;
  label: string;
  Icon: IconType;
  badgeCount?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={
        "relative flex items-center gap-3 rounded-[var(--radius-md)] mx-auto sm:mx-0 w-11 h-11 sm:w-auto sm:h-auto justify-center sm:justify-start px-0 sm:px-3 py-0 sm:py-2 font-medium text-[13.5px] " +
        (active
          ? "bg-[var(--brand-tint)] text-[var(--brand)]"
          : "text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)]")
      }
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      {typeof badgeCount === "number" && badgeCount > 0 && (
        <>
          <UnseenBadge count={badgeCount} />
          <UnseenBadge count={badgeCount} corner />
        </>
      )}
    </Link>
  );
}

/** Persistent left nav — sidebar on desktop/tablet (216px, labeled),
 * icon rail on phone (48px, icon-only, 44x44 targets). Replaces the old
 * horizontal top bar + hamburger-drawer pattern (2026-08-18) — Oliver's
 * explicit direction, comparing against a sibling app ("Track 1") that
 * uses a fixed left sidebar: nav should stay in the same screen
 * location at every width, not move between a top bar and a slide-out
 * drawer. Confirmed and mocked up before building (see
 * project_atlas_ui_design memory, "Left sidebar nav" section) —
 * including the mobile rail's collapse width, which Oliver capped at
 * 48px/44x44 specifically to hold Apple's touch-target minimum rather
 * than shrinking further.
 *
 * Split into NavBar (server, reads the session cookie) + this client
 * component — usePathname needs a client component, but resolving the
 * session cookie needs a server one; the server wrapper passes down
 * just a display name, never the raw session token, to keep the client
 * bundle from touching anything session-shaped.
 *
 * Role-aware nav — the manager pages are gated server-side, so a STAFF
 * account sees the reduced nav entirely (no main nav list, just the
 * account menu's My Schedule / My Pay / Sign out), not a bounce-to-login.
 *
 * Red-pill unseen badge — `unseenScheduleCount` is resolved server-side
 * in NavBar.tsx (needs DB reads across leave + swap requests) and
 * passed down here as a number. Rendered on the "Schedule" nav item
 * only, in both the desktop-label and mobile-corner-dot forms (see
 * NavItem/UnseenBadge above).
 *
 * Account menu opens upward (`bottom-full`), not downward — the avatar
 * now lives pinned at the bottom of a fixed-height rail/sidebar, so
 * there's no room below it for a dropdown the way the old top-bar
 * version had. Click-outside/Escape/backdrop dismissal carried over
 * unchanged from the pre-retrofit version (2026-08-18 fix for the
 * account menu's keyboard/overlap gaps) — the hamburger-nav half of
 * that fix is gone along with the hamburger itself, since the rail has
 * no open/close state to dismiss anymore.
 */
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

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-20 w-12 sm:w-[216px] flex flex-col bg-[var(--card)] border-r border-[var(--border)]"
      aria-label="Main navigation"
    >
      <div className="h-14 flex items-center justify-center sm:justify-start px-0 sm:px-4 shrink-0">
        <Link
          href="/"
          aria-label="Atlas home"
          className="sm:hidden w-8 h-8 rounded-[var(--radius-md)] bg-[var(--brand)] text-white flex items-center justify-center font-bold text-[13px]"
        >
          A
        </Link>
        <Link
          href="/"
          className="hidden sm:block font-bold text-[17px] text-[var(--brand)] hover:text-[var(--brand-700)] tracking-tight"
        >
          Atlas
        </Link>
      </div>

      {isManager && (
        <nav
          aria-label="Sections"
          className="flex-1 overflow-y-auto flex flex-col items-center sm:items-stretch gap-1 px-1 sm:px-2 py-2"
        >
          {MANAGER_NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={isActive(item.href)}
              badgeCount={item.href === "/schedule" ? unseenScheduleCount : undefined}
            />
          ))}
        </nav>
      )}
      {!isManager && <div className="flex-1" />}

      <div className="border-t border-[var(--border)] py-2 px-1 sm:px-2 flex flex-col items-center sm:items-stretch gap-1 shrink-0">
        {isManager && (
          <NavItem
            href={SETTINGS_ITEM.href}
            label={SETTINGS_ITEM.label}
            Icon={SETTINGS_ITEM.icon}
            active={isActive(SETTINGS_ITEM.href)}
          />
        )}
        {auth ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`${auth.name} — account menu`}
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 w-11 h-11 sm:w-full sm:h-auto mx-auto sm:mx-0 justify-center sm:justify-start rounded-[var(--radius-md)] px-0 sm:px-2 sm:py-2 hover:bg-[var(--paper)] transition-colors"
            >
              <Avatar name={auth.name} size={32} />
              <span className="hidden sm:flex flex-col items-start leading-tight overflow-hidden min-w-0">
                <span className="text-[13px] font-semibold text-[var(--ink-900)] truncate max-w-[130px]">
                  {auth.name}
                </span>
                <span className="text-[11.5px] text-[var(--ink-500)]">
                  {auth.systemRole === "STAFF" ? "Staff" : "Manager"}
                </span>
              </span>
            </button>
            {menuOpen && (
              <>
                {/* Invisible full-screen backdrop so the menu reliably
                 * renders above every other positioned element on the
                 * page and gets a second, more discoverable dismiss
                 * (tap anywhere), alongside outside-click/Escape. */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute left-0 sm:left-1 bottom-full mb-2 w-48 z-20 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-2)] py-1 text-sm"
                >
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <p className="font-medium truncate text-[var(--ink-900)]">{auth.name}</p>
                    <p className="text-xs text-[var(--ink-500)]">{auth.systemRole === "STAFF" ? "Staff" : "Manager"}</p>
                  </div>
                  <Link
                    href="/me/schedule"
                    role="menuitem"
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
                    role="menuitem"
                    className={
                      "block px-3 py-2.5 " +
                      (pathname === "/me" ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-700)] hover:bg-[var(--paper)]")
                    }
                  >
                    My Pay
                  </Link>
                  <form action={logout} className="border-t border-[var(--border)]">
                    <button type="submit" role="menuitem" className="w-full text-left px-3 py-2.5 text-[var(--ink-700)] hover:bg-[var(--paper)]">
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            aria-label="Staff Login"
            aria-current={pathname === "/login" ? "page" : undefined}
            className={
              "flex items-center gap-3 rounded-[var(--radius-md)] mx-auto sm:mx-0 w-11 h-11 sm:w-auto sm:h-auto justify-center sm:justify-start px-0 sm:px-3 py-0 sm:py-2 font-medium text-[13.5px] " +
              (pathname === "/login"
                ? "bg-[var(--brand-tint)] text-[var(--brand)]"
                : "text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)]")
            }
          >
            <LoginIcon className="w-[18px] h-[18px] shrink-0" />
            <span className="hidden sm:inline">Staff Login</span>
          </Link>
        )}
      </div>
    </aside>
  );
}
