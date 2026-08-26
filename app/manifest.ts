import type { MetadataRoute } from "next";

/** PWA manifest (2026-08-25, Oliver's Safari-floating-bars question):
 * with this + the apple meta in layout.tsx, "Add to Home Screen" opens
 * Atlas full-screen from its own icon -- no Safari chrome at all, which
 * is the only way iOS allows the bars to disappear. Colors match the
 * light theme's --paper/--primary tokens. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas",
    short_name: "Atlas",
    description: "Restaurant closing report & management",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#1D4ED8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
