/** Human-readable label for an account's system role (2026-08-23).
 *
 * Exists because the nav rail and the account menu both rendered
 * `systemRole === "STAFF" ? "Staff" : "Manager"` — a two-way branch over a
 * three-value enum, so an ADMIN was labelled "Manager" in the only place
 * the app tells you which account you are signed in as. Caught by a live
 * visual audit; tsc could not see it, because both arms of the ternary are
 * perfectly valid strings.
 *
 * A Record keyed by the union type rather than another ternary chain, on
 * purpose: adding a fourth role to `systemRole` now fails the build here
 * instead of silently falling into whichever arm happened to be last. The
 * bug class is "a branch that does not enumerate its input" — the fix is a
 * total mapping, not a longer branch.
 *
 * Title case, matching how the nav already presented these. /people and
 * /permissions render the raw enum (ADMIN/MANAGER/STAFF) instead — that is
 * an admin-facing surface where the literal stored value is the useful
 * thing to see, so it is deliberately left alone.
 */
export type SystemRole = "STAFF" | "MANAGER" | "ADMIN";

const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  STAFF: "Staff",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

export function formatSystemRole(role: SystemRole): string {
  return SYSTEM_ROLE_LABELS[role];
}
