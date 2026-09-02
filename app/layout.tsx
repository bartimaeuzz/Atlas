import type { Metadata, Viewport } from "next";
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
import { PullToRefresh } from "./PullToRefresh";
import { NumberPasteSanitizer } from "@/components/NumberPasteSanitizer";
import { LiveRegions } from "@/components/ui/LiveRegions";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";

export const metadata: Metadata = {
  title: "Mohom",
  description: "Restaurant closing report & management",
  // PWA (2026-08-25): with app/manifest.ts, Add to Home Screen opens
  // Atlas full-screen with no Safari bars. iOS reads these apple fields
  // and the touch icon, not the manifest's.
  appleWebApp: { capable: true, title: "Mohom", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // cover + the safe-area padding in globals.css: content extends under
  // the notch/home-indicator without controls getting trapped there.
  viewportFit: "cover",
  themeColor: "#1D4ED8",
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

  // Whether there is a rail at all. NavBar renders nothing for a
  // signed-out visitor, so the content must not reserve space for it --
  // otherwise /login sits behind a 48px gutter with nothing in it.
  // getViewerCapabilities is React-cache()d per request and NavBar calls
  // it too, so this is the same resolution, not a second database read.
  const signedIn = (await getViewerCapabilities())?.session != null;

  return (
    // lang stays "en" on purpose (2026-09-02): every string the app renders
    // is English (feedback-plain-warm-concise-voice); Thai fonts are loaded
    // for user-entered names only. When a real locale setting exists, this
    // is the one place it must be applied — do not hardcode a second one.
    <html lang="en" className="h-full antialiased">
      {/* NavBar renders as a fixed-position left sidebar/rail (2026-08-18
       * retrofit, replacing the old in-flow top bar) — it no longer takes
       * up document flow space, so `children` just needs matching
       * left padding to clear it, not a flex layout. Width matches
       * NavBarClient's own w-12 (48px, rail below 1024px / collapsed desktop) /
       * lg:w-[216px] (expanded desktop sidebar) exactly; keep these two
       * in sync if either changes — NavContentWrapper is the one place
       * that actually applies the padding, driven by the same
       * NavCollapseContext state NavBarClient reads for its own width. */}
      <body className="min-h-full font-sans bg-[var(--paper)] text-[var(--ink-900)]">
        {/* Skip link (2026-09-02, WCAG 2.4.1): first focusable thing on every
         * page, invisible until it has keyboard focus, then a small pill at
         * the top-left. Lands on NavContentWrapper's #main-content so a
         * keyboard or screen-reader user is not walked through the whole
         * sidebar on every single page. */}
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <LiveRegions />
        <NavCollapseProvider initialCollapsed={navCollapsed}>
          <NavBar />
          <PullToRefresh />
          <NumberPasteSanitizer />
          <NavContentWrapper hasNav={signedIn}>{children}</NavContentWrapper>
        </NavCollapseProvider>
      </body>
    </html>
  );
}
