"use client";

import type { ReactNode } from "react";
import { useNavCollapse } from "./NavCollapseContext";

/** Offsets page content to clear the fixed-position sidebar/rail — width
 * has to track NavBarClient's own collapsed state exactly (via
 * NavCollapseContext) or content either overlaps the rail (padding too
 * small) or leaves a stale empty gap after a collapse/expand toggle
 * (padding too large, since a plain server-rendered className can't
 * react to a client-side click without a full navigation). */
export function NavContentWrapper({ children, hasNav }: { children: ReactNode; hasNav: boolean }) {
  const { collapsed } = useNavCollapse();
  // Signed out there is no rail to clear (see app/NavBar.tsx), so no
  // offset either -- otherwise the login card sits behind an empty
  // gutter and never actually centres on the screen.
  // id + tabIndex: the skip link in app/layout.tsx lands here. tabIndex -1
  // makes a div focusable by script/anchor without adding a tab stop.
  if (!hasNav)
    return (
      <div id="main-content" tabIndex={-1} className="min-h-full outline-none">
        {children}
      </div>
    );
  // lg:, not sm: (2026-09-02) — see the note atop NavBarClient.tsx.
  return (
    <div
      id="main-content"
      tabIndex={-1}
      className={"min-h-full pl-12 outline-none transition-[padding-left] duration-150 ease-out " + (collapsed ? "" : "lg:pl-[216px]")}
    >
      {children}
    </div>
  );
}
