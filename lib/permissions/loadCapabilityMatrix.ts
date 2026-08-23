import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeeCapabilities } from "@/db/schema";
import { CAPABILITIES, type AccountType } from "./capabilities";

export interface CapabilityMatrixEmployeeRow {
  employeeId: number;
  nickname: string;
  systemRole: "STAFF" | "MANAGER" | "ADMIN";
  active: boolean;
  /** Which Account Type preset was last applied (2026-08-23). null =
   * none has been, which is the honest state for every account
   * predating the column -- see employees.accountType's schema comment.
   * The role cards on /permissions use it as the baseline for "what
   * differs from this person's preset"; with null there is no baseline
   * and the summary says so rather than guessing one. */
  accountType: AccountType | null;
  /** Every registry capability key -> current stored state for this
   * employee (defaults to not-granted/no-expiry if no row exists yet —
   * a fresh account has no employee_capabilities rows until something
   * is explicitly granted or a preset is applied). */
  capabilities: Record<string, { granted: boolean; expiresAt: string | null }>;
}

/** Loads every active-or-not employee (Admin needs to see and fix
 * everyone's permissions, not just active staff) with their full
 * capability state, for the "Permission and Roles" page. Deliberately
 * one query for capabilities across all employees rather than N+1 —
 * this page is Admin-only and low-traffic, but no reason to write it
 * the slow way. */
export async function loadCapabilityMatrix(): Promise<CapabilityMatrixEmployeeRow[]> {
  const [employeeRows, capabilityRows] = await Promise.all([
    db
      .select({
        id: employees.id,
        nickname: employees.nickname,
        systemRole: employees.systemRole,
        active: employees.active,
        accountType: employees.accountType,
      })
      .from(employees)
      .orderBy(employees.nickname),
    db
      .select({
        employeeId: employeeCapabilities.employeeId,
        capabilityKey: employeeCapabilities.capabilityKey,
        granted: employeeCapabilities.granted,
        expiresAt: employeeCapabilities.expiresAt,
      })
      .from(employeeCapabilities),
  ]);

  const byEmployee = new Map<number, Record<string, { granted: boolean; expiresAt: string | null }>>();
  for (const row of capabilityRows) {
    if (!byEmployee.has(row.employeeId)) byEmployee.set(row.employeeId, {});
    byEmployee.get(row.employeeId)![row.capabilityKey] = { granted: row.granted, expiresAt: row.expiresAt };
  }

  return employeeRows.map((emp) => {
    const stored = byEmployee.get(emp.id) ?? {};
    const capabilities: Record<string, { granted: boolean; expiresAt: string | null }> = {};
    for (const def of CAPABILITIES) {
      capabilities[def.key] = stored[def.key] ?? { granted: false, expiresAt: null };
    }
    return {
      employeeId: emp.id,
      nickname: emp.nickname,
      systemRole: emp.systemRole,
      active: emp.active,
      accountType: emp.accountType ?? null,
      capabilities,
    };
  });
}

/** Single-employee variant (2026-08-19) for pages that only need one
 * account's state (e.g. the eventual People form Account Type selector)
 * without loading the whole restaurant's matrix. */
export async function loadEmployeeCapabilities(
  employeeId: number
): Promise<Record<string, { granted: boolean; expiresAt: string | null }>> {
  const rows = await db
    .select({ capabilityKey: employeeCapabilities.capabilityKey, granted: employeeCapabilities.granted, expiresAt: employeeCapabilities.expiresAt })
    .from(employeeCapabilities)
    .where(eq(employeeCapabilities.employeeId, employeeId));
  const stored: Record<string, { granted: boolean; expiresAt: string | null }> = {};
  for (const row of rows) stored[row.capabilityKey] = { granted: row.granted, expiresAt: row.expiresAt };
  const capabilities: Record<string, { granted: boolean; expiresAt: string | null }> = {};
  for (const def of CAPABILITIES) capabilities[def.key] = stored[def.key] ?? { granted: false, expiresAt: null };
  return capabilities;
}
