import type { MetadataRoute } from "next";

/** PWA manifest (2026-08-25, Oliver's Safari-floating-bars question):
 * with this + the apple meta in layout.tsx, "Add to Home Screen" opens
 * Atlas full-screen from its own icon -- no Safari chrome at all, which
 * is the only way iOS allows the bars to disappear. Colors are the
 * Mohom deep/chalk (2026-09-02). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mohom",
    short_name: "Mohom",
    description: "Restaurant closing report & management",
    start_url: "/",
    display: "standalone",
    // Deep indigo chrome behind the deep icon tile (continuous), chalk boot
    // splash matching the app ground (2026-09-02).
    background_color: "#F7F3EA",
    theme_color: "#101B33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
