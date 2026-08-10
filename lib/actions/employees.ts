"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeePositions, employeeWageRates, positions } from "@/db/schema";

export interface EmployeeActionState {
  error: string | null;
}

const SYSTEM_ROLES = ["STAFF", "MANAGER", "ADMIN"] as const;

/** Same "gather + validate, redirect() outside the try/catch" pattern as
 * lib/actions/positions.ts. Position assignment fields are dynamic
 * (per-position, keyed by id) — same field-naming approach as the closing
 * report's metric_shift_<id> / metric_emp_<id>_<employeeId> fields:
 *   assign_<positionId>            checkbox — is this employee assigned?
 *   tipPoint_<positionId>          standing tip point value for that position
 *   wageRate_<positionId>_Lunch    BOH-only wage rate, Lunch
 *   wageRate_<positionId>_Dinner   BOH-only wage rate, Dinner
 */
function readEmployeeForm(formData: FormData, allPositionIds: number[]) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Employee name is required");

  const active = formData.get("active") === "on";

  const hireDateRaw = String(formData.get("hireDate") ?? "").trim();
  const hireDate = hireDateRaw || null;

  const primaryPositionIdRaw = formData.get("primaryPositionId");
  const primaryPositionId =
    primaryPositionIdRaw && String(primaryPositionIdRaw).trim() !== "" ? Number(primaryPositionIdRaw) : null;

  const systemRoleRaw = String(formData.get("systemRole") ?? "");
  if (!SYSTEM_ROLES.includes(systemRoleRaw as (typeof SYSTEM_ROLES)[number])) {
    throw new Error("Invalid system role");
  }
  const systemRole = systemRoleRaw as (typeof SYSTEM_ROLES)[number];

  const assignedPositionIds: number[] = [];
  const tipPointByPosition = new Map<number, number>();
  const wageRatesToInsert: { positionId: number; period: "Lunch" | "Dinner"; rate: number }[] = [];

  for (const positionId of allPositionIds) {
    if (formData.get(`assign_${positionId}`) !== "on") continue;
    assignedPositionIds.push(positionId);

    const tipPointRaw = formData.get(`tipPoint_${positionId}`);
    const tipPointValue =
      tipPointRaw && String(tipPointRaw).trim() !== "" ? Number(tipPointRaw) : 1.0;
    if (Number.isNaN(tipPointValue) || tipPointValue < 0) {
      throw new Error(`Tip point value for position ${positionId} must be a non-negative number`);
    }
    tipPointByPosition.set(positionId, tipPointValue);

    for (const period of ["Lunch", "Dinner"] as const) {
      const raw = formData.get(`wageRate_${positionId}_${period}`);
      if (raw !== null && String(raw).trim() !== "") {
        const rate = Number(raw);
        if (Number.isNaN(rate) || rate < 0) {
          throw new Error(`${period} wage rate must be a non-negative number`);
        }
        wageRatesToInsert.push({ positionId, period, rate });
      }
    }
  }

  if (primaryPositionId !== null && !assignedPositionIds.includes(primaryPositionId)) {
    throw new Error("Primary position must be one of the assigned positions");
  }

  return {
    name,
    active,
    hireDate,
    primaryPositionId,
    systemRole,
    assignedPositionIds,
    tipPointByPosition,
    wageRatesToInsert,
  };
}

async function syncEmployeeChildRows(
  employeeId: number,
  assignedPositionIds: number[],
  tipPointByPosition: Map<number, number>,
  wageRatesToInsert: { positionId: number; period: "Lunch" | "Dinner"; rate: number }[]
) {
  await db.delete(employeePositions).where(eq(employeePositions.employeeId, employeeId));
  if (assignedPositionIds.length > 0) {
    await db.insert(employeePositions).values(
      assignedPositionIds.map((positionId) => ({
        employeeId,
        positionId,
        tipPointValue: tipPointByPosition.get(positionId) ?? 1.0,
      }))
    );
  }

  await db.delete(employeeWageRates).where(eq(employeeWageRates.employeeId, employeeId));
  if (wageRatesToInsert.length > 0) {
    await db.insert(employeeWageRates).values(
      wageRatesToInsert.map((r) => ({ employeeId, positionId: r.positionId, period: r.period, rate: r.rate }))
    );
  }
}

export async function createEmployee(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  let employeeId: number;
  try {
    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id));

    const [created] = await db
      .insert(employees)
      .values({
        name: parsed.name,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
      })
      .returning();
    employeeId = created.id;

    await syncEmployeeChildRows(employeeId, parsed.assignedPositionIds, parsed.tipPointByPosition, parsed.wageRatesToInsert);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/employees");
  redirect("/employees");
}

export async function updateEmployee(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = Number(formData.get("employeeId"));
  if (!employeeId) return { error: "Missing employee id" };

  try {
    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id));

    await db
      .update(employees)
      .set({
        name: parsed.name,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
      })
      .where(eq(employees.id, employeeId));

    await syncEmployeeChildRows(employeeId, parsed.assignedPositionIds, parsed.tipPointByPosition, parsed.wageRatesToInsert);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/employees");
  redirect("/employees");
}

/** Retire/reactivate — never a hard delete, same reasoning and pattern as
 * togglePositionActive. A retired employee stays valid for every
 * historical shift they were rostered on; loadRosterPageData's
 * allEmployees query already filters to active only for NEW roster
 * entries (pre-existing filter, unrelated to this round). */
export async function toggleEmployeeActive(employeeId: number, nextActive: boolean) {
  await db.update(employees).set({ active: nextActive }).where(eq(employees.id, employeeId));
  revalidatePath("/employees");
}
