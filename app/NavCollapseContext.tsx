"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const COOKIE_NAME = "atlas-nav-collapsed";

type NavCollapseValue = { collapsed: boolean; toggle: () => void };

const NavCollapseContext = createContext<NavCollapseValue | null>(null);

/** Shares the desktop sidebar's collapsed/expanded state between the
 * sidebar itself (NavBarClient) and the content-offset wrapper
 * (NavContentWrapper), so both resize together instantly instead of the
 * content padding staying stale until the next navigation. Initial value
 * comes from a cookie read server-side in layout.tsx (not localStorage)
 * specifically so the very first server-rendered paint already has the
 * right sidebar width/content padding — no flash, no hydration
 * mismatch, and no waiting on a client-only effect to catch up.
 *
 * 2026-08-19, Oliver: "desktop version should be able to collapse nav
 * bar." Desktop/tablet (sm+) only — the mobile rail already has its own
 * fixed 48px/44x44 floor (Oliver, 2026-08-18: "let's keep fit the Apple
 * rules, so no more collapse or trims") and doesn't participate in this
 * toggle at all; the toggle button itself only renders at sm+. */
export function NavCollapseProvider({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      // Plain (non-httpOnly) cookie — this is a UI display preference,
      // not session-sensitive, so a direct client-side write is fine and
      // avoids a server round-trip just to remember a toggle state.
      document.cookie = `${COOKIE_NAME}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  }

  return <NavCollapseContext.Provider value={{ collapsed, toggle }}>{children}</NavCollapseContext.Provider>;
}

export function useNavCollapse(): NavCollapseValue {
  const ctx = useContext(NavCollapseContext);
  if (!ctx) throw new Error("useNavCollapse must be used within a NavCollapseProvider");
  return ctx;
}
