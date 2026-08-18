import type { Metadata } from "next";
import { cookies } from "next/headers";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/500.css";
import "@fontsource/noto-sans-thai/600.css";
import "@fontsource/noto-sans-thai/700.css";
import "./globals.css";
import { NavBar } from "./NavBar";
import { NavCollapseProvider } from "./NavCollapseContext";
import { NavContentWrapper } from "./NavContentWrapper";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Restaurant closing report & management",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read the desktop sidebar's collapsed/expanded preference server-side
  // (2026-08-19 collapsible-sidebar feature) so the very first painted
  // HTML already has the right sidebar width/content padding — no flash,
  // no hydration mismatch. See NavCollapseContext.tsx for why this is a
  // shared context (not two independent client states) and NavBarClient
  // for the mobile-rail-is-unaffected rationale.
  const cookieStore = await cookies();
  const navCollapsed = cookieStore.get("atlas-nav-collapsed")?.value === "1";

  return (
    <html lang="en" className="h-full antialiased">
      {/* NavBar renders as a fixed-position left sidebar/rail (2026-08-18
       * retrofit, replacing the old in-flow top bar) — it no longer takes
       * up document flow space, so `children` just needs matching
       * left padding to clear it, not a flex layout. Width matches
       * NavBarClient's own w-12 (48px, mobile rail / collapsed desktop) /
       * sm:w-[216px] (expanded desktop sidebar) exactly; keep these two
       * in sync if either changes — NavContentWrapper is the one place
       * that actually applies the padding, driven by the same
       * NavCollapseContext state NavBarClient reads for its own width. */}
      <body className="min-h-full font-sans bg-[var(--paper)] text-[var(--ink-900)]">
        <NavCollapseProvider initialCollapsed={navCollapsed}>
          <NavBar />
          <NavContentWrapper>{children}</NavContentWrapper>
        </NavCollapseProvider>
      </body>
    </html>
  );
}
