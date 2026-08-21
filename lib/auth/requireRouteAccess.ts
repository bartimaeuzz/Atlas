/**
 * Auth guard for Route Handlers (2026-08-21).
 *
 * WHY THIS EXISTS — a real hole found by the Phase C scrutinize pass:
 * all four .xlsx export endpoints live under app/(protected)/, which
 * looks protected, and is not. `app/(protected)/layout.tsx`'s
 * requireManager() only wraps PAGE renders — Next.js route handlers are
 * not wrapped by layouts. Every one of these was reachable with no
 * session at all, including /payroll/export, which returns every
 * employee's wages and pay-stub detail. This predates Phase C: the
 * Phase A audit swept lib/actions/*.ts, and these are route.ts files, so
 * nothing ever looked at them.
 *
 * Why not reuse requireManager()/requireCapability(): requireManager
 * calls redirect(), which is wrong for a file download — a fetch would
 * follow the redirect and hand back the login page's HTML with a 200,
 * which some clients will happily save as a .xlsx. requireCapability
 * throws a bare Error, which surfaces as a 500. A route handler should
 * answer with a status code, so this returns a Response to hand straight
 * back instead, and null when the caller may proceed.
 *
 * 401 vs 403 is deliberate: 401 means "you aren't signed in" (the client
 * can fix that by logging in), 403 means "you are, and this still isn't
 * yours" — nothing to retry.
 */

import { NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";

/** Manager/Admin standing role only — the route-handler equivalent of
 * the (protected) layout's requireManager(). Returns null when allowed,
 * or the Response to return immediately when not. */
export async function requireManagerRoute(): Promise<NextResponse | null> {
  const session = await getCurrentStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return null;
}

/** Manager/Admin AND a specific capability — for exports whose on-page
 * equivalent is behind a view guard, so downloading the file can't be an
 * end-run around the page you aren't allowed to open. */
export async function requireCapabilityRoute(capabilityKey: string): Promise<NextResponse | null> {
  const denied = await requireManagerRoute();
  if (denied) return denied;
  const viewer = await getViewerCapabilities();
  if (!viewer?.has(capabilityKey)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  return null;
}
