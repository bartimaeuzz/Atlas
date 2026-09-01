import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeeCapabilities } from "@/db/schema";
import { verifyPin } from "@/lib/auth/pin";

/** "A second pair of eyes" — confirm that somebody OTHER than the person
 * acting, who is themselves allowed to do this, is standing there
 * (2026-09-01, the two-person money controls).
 *
 * The rule is only **not the same person twice**. It deliberately does NOT
 * ask for a superior: Atlas's restaurant is run by co-owners who are not
 * each other's bosses, so a control that required a rank would have no one
 * to name. Any colleague who holds the same capability can be the second
 * person for any other — which is what lets a flat team run a real
 * financial control at all.
 *
 * Admins always qualify as a co-signer, matching the instant-check rule in
 * lib/actions/supplierCheck.ts, which is where this logic was first written
 * and proven. That copy is intentionally left in place for now: it is
 * working money code, and folding it into this helper is a
 * behaviour-preserving refactor of a payment path that deserves its own
 * old-vs-new comparison rather than riding along with a feature.
 *
 * Returns a human-readable reason on failure and null on success, so
 * callers keep using return-value errors (production redacts thrown
 * server-action errors).
 */
export async function verifySecondPerson(
  capabilityKey: string,
  actorEmployeeId: number,
  pin: string
): Promise<string | null> {
  const trimmed = pin.trim();
  if (!trimmed) return "A second person has to enter their PIN to confirm this.";

  const holders = await db
    .select({ employeeId: employeeCapabilities.employeeId })
    .from(employeeCapabilities)
    .where(and(eq(employeeCapabilities.capabilityKey, capabilityKey), eq(employeeCapabilities.granted, true)));
  const admins = await db.select({ id: employees.id }).from(employees).where(eq(employees.systemRole, "ADMIN"));

  const cosignerIds = new Set<number>([...holders.map((h) => h.employeeId), ...admins.map((a) => a.id)]);
  // A second copy of your own PIN is not a second person.
  cosignerIds.delete(actorEmployeeId);
  if (cosignerIds.size === 0) {
    return "Nobody else is set up to confirm this yet — ask an admin to give a second person this permission.";
  }

  const cosigners = await db
    .select({ pinHash: employees.pinHash })
    .from(employees)
    .where(and(inArray(employees.id, Array.from(cosignerIds)), eq(employees.active, true)));

  const ok = cosigners.some((c) => c.pinHash && verifyPin(trimmed, c.pinHash));
  return ok ? null : "That PIN doesn't belong to another person who can confirm this — couldn't confirm.";
}
