import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "./NavBar";

export const metadata: Metadata = {
  title: "Atlas Track 2",
  description: "Standalone prototype — tip pool calculation engine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
