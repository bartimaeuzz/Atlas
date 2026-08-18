import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Atlas",
  description: "Restaurant closing report & management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* NavBar renders as a fixed-position left sidebar/rail (2026-08-18
       * retrofit, replacing the old in-flow top bar) — it no longer takes
       * up document flow space, so `children` just needs matching
       * left padding to clear it, not a flex layout. Width matches
       * NavBarClient's own w-12 (48px, mobile rail) / sm:w-[216px]
       * (desktop sidebar) exactly; keep these two in sync if either
       * changes. */}
      <body className="min-h-full font-sans bg-[var(--paper)] text-[var(--ink-900)]">
        <NavBar />
        <div className="min-h-full pl-12 sm:pl-[216px]">{children}</div>
      </body>
    </html>
  );
}
