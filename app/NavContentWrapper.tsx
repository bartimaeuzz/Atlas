"use client";

import type { ReactNode } from "react";
import { useNavCollapse } from "./NavCollapseContext";

/** Offsets page content to clear the fixed-position sidebar/rail — width
 * has to track NavBarClient's own collapsed state exactly (via
 * NavCollapseContext) or content either overlaps the rail (padding too
 * small) or leaves a stale empty gap after a collapse/expand toggle
 * (padding too large, since a plain server-rendered className can't
 * react to a client-side click without a full navigation). */
export function NavContentWrapper({ children }: { children: ReactNode }) {
  const { collapsed } = useNavCollapse();
  return (
    <div className={"min-h-full pl-12 transition-[padding-left] duration-150 ease-out " + (collapsed ? "" : "sm:pl-[216px]")}>
      {children}
    </div>
  );
}
