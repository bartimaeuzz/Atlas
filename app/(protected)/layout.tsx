import { requireManager } from "@/lib/auth/guard";

/**
 * Shared guard for every manager-facing page (see lib/auth/guard.ts).
 * A Next.js route group — the "(protected)" segment is invisible in
 * URLs, so /shifts, /employees, /positions, /settings, /reports, and
 * /schedule/** all still resolve exactly as before; this layout just
 * wraps them with an auth check before rendering.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireManager();
  return <>{children}</>;
}
