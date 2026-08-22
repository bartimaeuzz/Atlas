/**
 * The single definition of "does this viewer effectively hold this
 * capability" — extracted to its own module 2026-08-22 so it can be
 * imported from a CLIENT component as well as the server.
 *
 * It used to live in viewerCapabilities.ts, which imports the Drizzle
 * client and the session helpers; pulling that into a "use client" file
 * would drag server-only code into the browser bundle. The alternative —
 * re-implementing the rule in the client — is exactly the duplication
 * Phase C consolidated away, and an access rule that exists twice will
 * eventually disagree with itself. So the rule moves to a pure module
 * with no imports, and viewerCapabilities.ts re-exports it unchanged.
 */

export interface CapabilityGrantRow {
  granted: boolean;
  expiresAt: string | null;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `isAdmin` short-circuits before the row is consulted at all: an Admin
 * must never be able to lock itself out of its own admin surface, and
 * every capability's registry default is ADMIN: true anyway, so the
 * bypass can only ever grant MORE access than the rows alone. See
 * requireCapability.ts's header for the full reasoning and the
 * production incident that motivated it.
 *
 * Expiry is exclusive: a capability stays usable through the whole of
 * its expiry date, and is refused only from the following day. */
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
