/**
 * Permission System — Phase C, page-level view guards (2026-08-21).
 *
 * requireCapability.ts (Phase B) is the *action* half of enforcement: it
 * throws on a server action a caller isn't allowed to run. This file is
 * the *page* half. A page can't usefully throw — it has to decide what to
 * render — so this exposes the same grant decision as a boolean instead,
 * and pages pair it with <NoAccess /> (components/NoAccess.tsx).
 *
 * Both halves now read one shared decision function (`grantAllows` below)
 * so there is exactly one definition in the codebase of what "holds this
 * capability" means: granted=true, not past its expiry, with an ADMIN
 * bypass. requireCapability.ts's header explains at length why the ADMIN
 * bypass exists (an Admin must never be able to lock itself out of its
 * own admin surface, and every capability's registry default is
 * ADMIN: true anyway, so the bypass can only ever grant MORE access than
 * the rows alone). That reasoning applies identically to view guards, so
 * the behaviour is deliberately shared rather than re-decided here.
 *
 * "No row" means "not granted", same convention as
 * loadCapabilityMatrix.ts and requireCapability.ts.
 *
 * Why a whole-set load rather than one query per key: the home page
 * (app/page.tsx) has to decide the visibility of every manager tile at
 * once, and the Analytics page checks two keys. Fetching an employee's
 * ~20 capability rows once is cheaper than N round-trips and keeps every
 * check on one consistent snapshot.
 */

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeCapabilities } from "@/db/schema";
import { getCurrentStaffSession, type StaffSessionEmployee } from "@/lib/auth/session";
import { isValidCapabilityKey } from "@/lib/permissions/capabilities";

export interface CapabilityGrantRow {
  granted: boolean;
  expiresAt: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The single definition of "this viewer holds this capability", shared by
 * the action guard (requireCapability) and the page guards. `isAdmin`
 * short-circuits before the row is even consulted — see the file header. */
export function grantAllows(
  isAdmin: boolean,
  row: CapabilityGrantRow | undefined,
  today: string = todayIso(),
): boolean {
  if (isAdmin) return true;
  if (!row || !row.granted) return false;
  if (row.expiresAt && row.expiresAt < today) return false;
  return true;
}

export interface ViewerCapabilities {
  session: StaffSessionEmployee;
  isAdmin: boolean;
  /** Throws on an unknown key — a typo'd capability string is a
   * programmer error, and silently answering false would hide a page
   * from everyone forever with no error to notice. Same reasoning as
   * requireCapability's own unknown-key throw. */
  has: (capabilityKey: string) => boolean;
}

/** Loads every capability row for the signed-in employee in one query.
 *
 * Wrapped in React's `cache()` so it is memoized per request: the nav
 * rail, the page itself, and any component that asks all share one
 * lookup instead of each paying a round trip. Without this a single
 * /ledger render cost 4 extra queries (nav + page, each also resolving
 * the session). Note this is per-request memoization, NOT caching across
 * requests -- a permission change still takes effect on the very next
 * page load.
 *
 * getCurrentStaffSession() itself is deliberately NOT wrapped: it is
 * also called from server actions, and memoizing it across a request
 * that sets or clears the session cookie mid-flight (login, logout)
 * could hand back a stale answer. Memoizing this one function already
 * collapses the duplicate work, since every extra capability lookup in
 * a render goes through here.
 * Returns null when nobody is signed in — callers inside the (protected)
 * route group can treat that as "not allowed", since that layout's
 * requireManager() has already redirected anonymous visitors to /login. */
export const getViewerCapabilities = cache(async function getViewerCapabilities(): Promise<ViewerCapabilities | null> {
  const session = await getCurrentStaffSession();
  if (!session) return null;

  const rows = await db
    .select({
      capabilityKey: employeeCapabilities.capabilityKey,
      granted: employeeCapabilities.granted,
      expiresAt: employeeCapabilities.expiresAt,
    })
    .from(employeeCapabilities)
    .where(eq(employeeCapabilities.employeeId, session.id));

  return buildViewerCapabilities(session, rows);
});

/** The whole decision, minus the database. Split out from
 * getViewerCapabilities so the row-to-answer mapping is directly
 * testable — the DB wrapper above is then thin enough to read at a
 * glance, and a regression in (say) which column the map is keyed on
 * fails a unit test instead of only failing in production. */
export function buildViewerCapabilities(
  session: StaffSessionEmployee,
  rows: { capabilityKey: string; granted: boolean; expiresAt: string | null }[],
  today: string = todayIso(),
): ViewerCapabilities {
  const isAdmin = session.systemRole === "ADMIN";
  const byKey = new Map<string, CapabilityGrantRow>();
  for (const row of rows) {
    byKey.set(row.capabilityKey, { granted: row.granted, expiresAt: row.expiresAt });
  }

  return {
    session,
    isAdmin,
    has(capabilityKey: string): boolean {
      if (!isValidCapabilityKey(capabilityKey)) {
        throw new Error(`Unknown capability key: ${capabilityKey}`);
      }
      return grantAllows(isAdmin, byKey.get(capabilityKey), today);
    },
  };
}

/** Convenience for a page that only needs to check one key. */
export async function hasCapability(capabilityKey: string): Promise<boolean> {
  const viewer = await getViewerCapabilities();
  return viewer ? viewer.has(capabilityKey) : false;
}
