"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { useNavCollapse } from "./NavCollapseContext";
import {
  ShiftsIcon,
  PeopleIcon,
  PositionsIcon,
  ScheduleIcon,
  LedgerIcon,
  ReportsIcon,
  ActivityLogIcon,
  AnalyticsIcon,
  PayrollIcon,
  SettingsIcon,
  ChevronDownIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import type { ComponentType, ReactNode, SVGProps } from "react";

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
  { href: "/activity", label: "Activity", icon: ActivityLogIcon },
];
const SETTINGS_ITEM: { href: string; label: string; icon: IconType } = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};
// Admin-only, matching the confirmed Permission System design ("Manage
// Permissions — Admin ✓ only, not delegable") — kept separate from
// SETTINGS_ITEM/MANAGER_NAV_ITEMS so its render gate below can check
// systemRole === "ADMIN" specifically rather than the broader isManager.
const PERMISSIONS_ITEM: { href: string; label: string; icon: IconType } = {
  href: "/permissions",
  label: "Permissions",
  icon: ShieldIcon,
};

/** Red-pill badge — rendered twice per nav item (see NavItem below), one
 * copy per "icon-only" vs "labeled" appearance, since the labeled
 * sidebar shows it inline after the label and the icon-only rail (mobile,
 * or desktop collapsed — same visual treatment) shows it as a small
 * corner dot on the icon itself. A bare dot until the count is ambiguous
 * (>9), same convention as before the sidebar retrofit. */
function UnseenBadge({ count, corner, collapsed }: { count: number; corner?: boolean; collapsed: boolean }) {
  if (count <= 0) return null;
  const label = `${count} unseen ${count === 1 ? "schedule item" : "schedule items"}`;
  if (corner) {
    return (
      <span
        className={
          (collapsed ? "" : "sm:hidden ") +
          "absolute top-0.5 right-0.5 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-[var(--radius-full)] bg-[var(--danger)] text-white text-[9px] font-medium leading-none"
        }
        aria-label={label}
      >
        {count > 9 ? "9+" : count}
      </span>
    );
  }
  return (
    <span
      className={
        (collapsed ? "hidden" : "hidden sm:inline-flex") +
        " ml-auto items-center justify-center min-w-[16px] h-[16px] px-1 rounded-[var(--radius-full)] bg-[var(--danger)] text-white text-[10px] font-medium leading-none align-middle"
      }
      aria-label={label}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Floating hover/focus label for collapsed-rail icons (visual-audit
 * finding, 2026-08-19: collapsed sidebar icons had no visible label on
 * hover or keyboard focus, only an aria-label for screen readers — real
 * for mouse users, and a WCAG gap for keyboard users since aria-label
 * alone produces no visible focus indicator of *what* the icon is).
 * Reuses the same card/border/shadow tokens as the account-menu popover
 * rather than inventing a new component.
 *
 * Portal-rendered to document.body with a JS-computed fixed position,
 * NOT a plain CSS absolute/group-hover span — the main nav list sits in
 * a `overflow-y-auto` scroll container (needed for long lists on short
 * viewports), and CSS overflow clips any positioned descendant that
 * extends past its edge, including one positioned via `left-full`. A
 * first pass using group-hover/absolute rendered at opacity:1 in the
 * DOM (confirmed via computed-style inspection) but was invisibly
 * clipped by that ancestor — caught by re-checking the deployed fix
 * live rather than trusting the code-level checks alone. Escaping via
 * a portal + `position: fixed` sidesteps the clipping entirely.
 *
 * `active` gates whether this even attaches listeners/renders anything
 * — false for every row when the sidebar is expanded (the text label is
 * already visible inline, no tooltip needed) or on the mobile rail
 * (deliberately always icon-only with no hover concept to serve, see
 * NavItem doc comment above; the desktop-collapsed toggle intentionally
 * doesn't affect mobile's own icon-only rendering — see NavItem's
 * `collapsed` prop usage). */
function useCollapsedTooltip<T extends HTMLElement>(label: string, active: boolean) {
  const ref = useRef<T | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }, [open]);

  if (!active) {
    return { ref, handlers: {}, tooltip: null as ReactNode };
  }

  const handlers = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  };

  const tooltip =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-30 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[12px] font-medium text-[var(--ink-900)] shadow-[var(--shadow-2)] sm:block"
          >
            {label}
          </span>,
          document.body
        )
      : null;

  return { ref, handlers, tooltip };
}

/** One nav row. Labeled appearance (desktop sidebar, expanded — >= sm and
 * not collapsed): icon + visible text label, full width. Icon-only
 * appearance (mobile rail always, OR desktop sidebar collapsed): 44x44
 * tap target (Apple's comfortable-use minimum — confirmed with Oliver
 * 2026-08-18 as the floor for the mobile rail specifically, no further
 * collapsing/trimming there) centered in the 48px rail, with an
 * aria-label carrying the name for screen readers. This is a deliberate,
 * confirmed exception to the icon+visible-label rule elsewhere in the
 * app (see project_atlas_ui_design memory) — a persistent always-visible
 * rail is a different risk profile than the hover-only title= tooltips
 * that rule exists to stop. The desktop-collapsed state reuses this
 * exact same icon-only treatment rather than inventing a second one. */
function NavItem({
  href,
  label,
  Icon,
  badgeCount,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  Icon: IconType;
  badgeCount?: number;
  active: boolean;
  collapsed: boolean;
}) {
  const sizeClasses = collapsed
    ? "mx-auto w-11 h-11 justify-center px-0"
    : "mx-auto sm:mx-0 w-11 h-11 sm:w-auto justify-center sm:justify-start px-0 sm:px-3";
  const { ref: tooltipRef, handlers: tooltipHandlers, tooltip } = useCollapsedTooltip<HTMLAnchorElement>(label, collapsed);
  return (
    <>
      <Link
        href={href}
        ref={tooltipRef}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={
          "relative flex items-center gap-3 rounded-[var(--radius-md)] font-medium text-[13.5px] " +
          sizeClasses +
          " " +
          (active
            ? "bg-[var(--brand-tint)] text-[var(--brand)]"
            : "text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)]")
        }
        {...tooltipHandlers}
      >
        <Icon className="w-[18px] h-[18px] shrink-0" />
        <span className={collapsed ? "hidden" : "hidden sm:inline"}>{label}</span>
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <>
            <UnseenBadge count={badgeCount} collapsed={collapsed} />
            <UnseenBadge count={badgeCount} corner collapsed={collapsed} />
          </>
        )}
      </Link>
      {tooltip}
    </>
  );
}

/** Desktop-only collapse/expand toggle (2026-08-19, Oliver: "desktop
 * version should be able to collapse nav bar"). Sits right under the
 * brand header, styled like a nav row so it reads as part of the same
 * rail rather than a bolted-on control. Absent at mobile widths — the
 * mobile rail is already at its confirmed floor (48px/44x44, no further
 * collapsing) and has no toggle to begin with. The chevron flips to show
 * which direction the action goes: pointing toward the edge the sidebar
 * will collapse into when expanded, pointing back out when collapsed. */
function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { ref: tooltipRef, handlers: tooltipHandlers, tooltip } = useCollapsedTooltip<HTMLButtonElement>("Expand", collapsed);
  return (
    <>
      <button
        type="button"
        ref={tooltipRef}
        onClick={onToggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-pressed={collapsed}
        className={
          "relative hidden sm:flex items-center gap-3 h-11 rounded-[var(--radius-md)] font-medium text-[13.5px] text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)] " +
          (collapsed ? "w-11 mx-auto justify-center px-0" : "w-auto justify-start px-3 mx-2")
        }
        {...tooltipHandlers}
      >
        <ChevronDownIcon className={"w-[18px] h-[18px] shrink-0 " + (collapsed ? "-rotate-90" : "rotate-90")} />
        {!collapsed && <span>Collapse</span>}
      </button>
      {tooltip}
    </>
  );
}

/** Persistent left nav — sidebar on desktop/tablet (216px, labeled,
 * collapsible to a 48px icon rail as of 2026-08-19), icon rail on phone
 * (48px, icon-only, 44x44 targets, not collapsible further). Replaces
 * the old horizontal top bar + hamburger-drawer pattern (2026-08-18) —
 * Oliver's explicit direction, comparing against a sibling app ("Track
 * 1") that uses a fixed left sidebar: nav should stay in the same screen
 * location at every width, not move between a top bar and a slide-out
 * drawer. Confirmed and mocked up before building (see
 * project_atlas_ui_design memory, "Left sidebar nav" section) —
 * including the mobile rail's collapse width, which Oliver capped at
 * 48px/44x44 specifically to hold Apple's touch-target minimum rather
 * than shrinking further.
 *
 * Desktop collapse (2026-08-19): a separate, independent toggle from the
 * mobile rail above — collapses the 216px labeled sidebar down to the
 * same 48px icon-only look, driven by NavCollapseContext (shared with
 * NavContentWrapper so the page content's left padding resizes in step,
 * see that file). Persisted via a plain cookie (read server-side in
 * layout.tsx) rather than localStorage specifically so the first
 * server-rendered paint is already correct — no flash, no mismatch.
 *
 * `<nav>`/bottom-icons horizontal alignment (2026-08-19, Oliver caught it
 * from a live screenshot — took two passes to actually fix, see below):
 *
 * First pass swapped a flat `items-center sm:items-stretch` for a branch
 * on the JS `collapsed` prop, since `sm:` is a viewport-width breakpoint
 * and doesn't know about `collapsed` — a *desktop-width* collapsed
 * sidebar was still getting `sm:items-stretch`. That was real, but
 * shipping and re-checking it live (commit 5176147) showed the icons
 * were STILL flush against the rail's right edge with no gap — the
 * actual bug was one level deeper and this alone didn't fix it.
 *
 * Real cause: the collapsed rail is 48px (`w-12`) with a 1px right
 * border, so 47px of interior width is available. Each icon-only
 * `NavItem`/`CollapseToggle`/account button is 44px (`w-11 h-11`) and
 * centers itself via its own `mx-auto` — but the `<nav>`/bottom-icons
 * containers additionally had `px-1` (4px each side) on top of that,
 * leaving only 47 - 8 = 39px of content box for a 44px child. A child
 * wider than its content box can't be centered by auto margins — the
 * browser has no negative space to distribute, so the margins resolve
 * to 0 and the child sits flush at the content box's start edge, which
 * happens to be flush against the rail's own right border. `items-center`
 * on the container never mattered here; `mx-auto` on the child was
 * always what did the centering, and it silently failed under overflow.
 * (The same `px-1` was present on the always-icon-only mobile rail too,
 * via the shared non-`sm:` base classes — same latent bug there, just
 * less visually obvious at that width; this fix covers both.)
 *
 * Fix: drop that redundant `px-1`/`px-0 pb-1` padding to `px-0` on the
 * icon-only rail (both the collapsed-desktop branch and the shared
 * mobile-width base), so the icon's own `mx-auto` has the full 47px to
 * center 44px within — a small, even ~1.5px gap on each side, matching
 * how the header's "A" logo (`px-0`, `justify-center`) already centers
 * cleanly in the same rail width.
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
 * only, in both the labeled and icon-only-corner-dot forms (see
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
  hiddenNavHrefs = [],
  navHrefOverrides = {},
}: {
  /** Never null: NavBar returns null for a signed-out visitor, so this
   *  component only ever renders for a real session (2026-08-23). */
  auth: { name: string; systemRole: "STAFF" | "MANAGER" | "ADMIN" };
  unseenScheduleCount?: number;
  /** Hrefs from NAV_ITEM_CAPABILITY the current viewer doesn't hold the
   * capability for — resolved server-side in NavBar.tsx (2026-08-21).
   * Hiding them here is the dead-end guard: those pages now render a
   * no-access notice, and a nav rail that keeps offering them would put
   * a permanent broken-looking link in front of the person on every
   * single screen. */
  hiddenNavHrefs?: string[];
  /** Nav items whose destination differs for this viewer -- currently
   * only Ledger, which points at the Card report for someone who holds
   * the card key but not the overview key. Keyed by the item's canonical
   * href (2026-08-21). */
  navHrefOverrides?: Record<string, string>;
}) {
  const pathname = usePathname();
  const isManager = auth.systemRole === "MANAGER" || auth.systemRole === "ADMIN";
  const hidden = new Set(hiddenNavHrefs);
  const visibleManagerNavItems = MANAGER_NAV_ITEMS.filter((item) => !hidden.has(item.href)).map((item) =>
    navHrefOverrides[item.href] ? { ...item, href: navHrefOverrides[item.href] } : item,
  );
  const { collapsed, toggle } = useNavCollapse();

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

  const navItemSizeClasses = collapsed
    ? "mx-auto w-11 h-11 justify-center px-0"
    : "mx-auto sm:mx-0 w-11 h-11 sm:w-auto justify-center sm:justify-start px-0 sm:px-3";

  const {
    ref: accountTooltipRef,
    handlers: accountTooltipHandlers,
    tooltip: accountTooltip,
  } = useCollapsedTooltip<HTMLButtonElement>(auth.name, collapsed);

  return (
    <aside
      className={
        "fixed left-0 top-0 bottom-0 z-20 w-12 flex flex-col bg-[var(--card)] border-r border-[var(--border)] transition-[width] duration-150 ease-out " +
        (collapsed ? "" : "sm:w-[216px]")
      }
      aria-label="Main navigation"
    >
      <div
        className={
          "h-14 flex items-center shrink-0 " + (collapsed ? "justify-center px-0" : "justify-center sm:justify-start px-0 sm:px-4")
        }
      >
        <Link
          href="/"
          aria-label="Atlas home"
          className={
            (collapsed ? "" : "sm:hidden ") +
            "w-8 h-8 rounded-[var(--radius-md)] bg-[var(--brand)] text-white flex items-center justify-center font-bold text-[13px]"
          }
        >
          A
        </Link>
        <Link
          href="/"
          className={
            (collapsed ? "hidden" : "hidden sm:block") + " font-bold text-[17px] text-[var(--brand)] hover:text-[var(--brand-700)] tracking-tight"
          }
        >
          Atlas
        </Link>
      </div>

      <div className={collapsed ? "px-0 pb-1" : "px-1 sm:px-2 pb-1"}>
        <CollapseToggle collapsed={collapsed} onToggle={toggle} />
      </div>

      {isManager && (
        <nav
          aria-label="Sections"
          className={
            "flex-1 overflow-y-auto flex flex-col gap-1 py-2 " +
            (collapsed ? "items-center px-0" : "items-center sm:items-stretch px-0 sm:px-2")
          }
        >
          {visibleManagerNavItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={isActive(item.href)}
              badgeCount={item.href === "/schedule" ? unseenScheduleCount : undefined}
              collapsed={collapsed}
            />
          ))}
        </nav>
      )}
      {!isManager && <div className="flex-1" />}

      <div
        className={
          "border-t border-[var(--border)] py-2 flex flex-col gap-1 shrink-0 " +
          (collapsed ? "items-center px-0" : "items-center sm:items-stretch px-0 sm:px-2")
        }
      >
        {isManager && !hidden.has(SETTINGS_ITEM.href) && (
          <NavItem
            href={SETTINGS_ITEM.href}
            label={SETTINGS_ITEM.label}
            Icon={SETTINGS_ITEM.icon}
            active={isActive(SETTINGS_ITEM.href)}
            collapsed={collapsed}
          />
        )}
        {auth.systemRole === "ADMIN" && (
          <NavItem
            href={PERMISSIONS_ITEM.href}
            label={PERMISSIONS_ITEM.label}
            Icon={PERMISSIONS_ITEM.icon}
            active={isActive(PERMISSIONS_ITEM.href)}
            collapsed={collapsed}
          />
        )}
        <div className="relative" ref={menuRef}>
            <button
              type="button"
              ref={accountTooltipRef}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`${auth.name} — account menu`}
              aria-expanded={menuOpen}
              className={
                "flex items-center gap-2.5 rounded-[var(--radius-md)] hover:bg-[var(--paper)] transition-colors " +
                navItemSizeClasses
              }
              {...accountTooltipHandlers}
            >
              <Avatar name={auth.name} size={32} />
              <span className={(collapsed ? "hidden" : "hidden sm:flex") + " flex-col items-start leading-tight overflow-hidden min-w-0"}>
                <span className="text-[13px] font-semibold text-[var(--ink-900)] truncate max-w-[130px]">
                  {auth.name}
                </span>
                <span className="text-[11.5px] text-[var(--ink-500)]">
                  {auth.systemRole === "STAFF" ? "Staff" : "Manager"}
                </span>
              </span>
            </button>
            {accountTooltip}
            {menuOpen && (
              <>
                {/* Invisible full-screen backdrop so the menu reliably
                 * renders above every other positioned element on the
                 * page and gets a second, more discoverable dismiss
                 * (tap anywhere), alongside outside-click/Escape. */}
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div
                  role="menu"
                  className={
                    "absolute bottom-full mb-2 w-48 z-20 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-2)] py-1 text-sm " +
                    (collapsed ? "left-0" : "left-0 sm:left-1")
                  }
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
      </div>
    </aside>
  );
}
