"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeePositions, employeeWageRates, positions } from "@/db/schema";
import { hashPin } from "@/lib/auth/pin";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { buildLoginId, LOGIN_ID_DEPARTMENTS, type LoginIdDepartment } from "@/lib/employees/loginId";

export interface EmployeeActionState {
  error: string | null;
}

const SYSTEM_ROLES = ["STAFF", "MANAGER", "ADMIN"] as const;

/** 2026-08-17 — this file had NO auth check at all before (only the
 * page-level requireManager() in app/(protected)/layout.tsx, which does
 * NOT protect a Server Action's own POST endpoint from being called
 * directly — same gap class already found and fixed in tipPools.ts/
 * payroll.ts, see project_atlas_security_audit_2026_08_17 memory).
 * Worth closing here regardless, but especially now that this file
 * writes SSN/DOB/address. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
}

/** Personal info (DOB, address, phone, SSN/ITIN) is Admin-only for now —
 * a stopgap ahead of the confirmed-but-not-yet-built Permission System's
 * Financial Auditor tier (see project_atlas_permission_system memory).
 * Any attempt to set these fields from a non-Admin session is silently
 * dropped, not just hidden in the UI — the same double-check discipline
 * used everywhere else sensitive data is written in this app. */
async function isAdminSession(): Promise<boolean> {
  const session = await getCurrentStaffSession();
  return session?.systemRole === "ADMIN";
}

/** Same "gather + validate, redirect() outside the try/catch" pattern as
 * lib/actions/positions.ts. Position assignment fields are dynamic
 * (per-position, keyed by id) — same field-naming approach as the closing
 * report's metric_shift_<id> / metric_emp_<id>_<employeeId> fields:
 *   assign_<positionId>            checkbox — is this employee assigned?
 *   tipPoint_<positionId>          standing tip point value for that position
 *   wageRate_<positionId>_Lunch    BOH-only wage rate, Lunch
 *   wageRate_<positionId>_Dinner   BOH-only wage rate, Dinner
 */
function readEmployeeForm(formData: FormData, allPositionIds: number[], includeSensitive: boolean) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) throw new Error("Nickname/display name is required");

  const legalFirstName = String(formData.get("legalFirstName") ?? "").trim();
  const legalLastName = String(formData.get("legalLastName") ?? "").trim();
  if (!legalFirstName || !legalLastName) {
    throw new Error("Legal first and last name are required (needed for payroll/tax documents)");
  }

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

  const isFinancialAuditor = formData.get("isFinancialAuditor") === "on";
  const isPartner = formData.get("isPartner") === "on";

  // Personal info — only read from the form (and therefore only ever
  // written) when the acting session is Admin. A non-Admin's form won't
  // render these fields at all, but this is the actual enforcement point,
  // not the UI hiding them.
  function optionalTrimmed(field: string): string | null {
    if (!includeSensitive) return undefined as unknown as string | null; // sentinel: "don't touch this field"
    const v = String(formData.get(field) ?? "").trim();
    return v || null;
  }
  const dateOfBirth = optionalTrimmed("dateOfBirth");
  const mobilePhone = optionalTrimmed("mobilePhone");
  const addressLine1 = optionalTrimmed("addressLine1");
  const addressLine2 = optionalTrimmed("addressLine2");
  const city = optionalTrimmed("city");
  const state = optionalTrimmed("state");
  const zipCode = optionalTrimmed("zipCode");
  const ssnOrItin = optionalTrimmed("ssnOrItin");

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
    nickname,
    legalFirstName,
    legalLastName,
    dateOfBirth,
    mobilePhone,
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
    ssnOrItin,
    active,
    hireDate,
    primaryPositionId,
    systemRole,
    isFinancialAuditor,
    isPartner,
    assignedPositionIds,
    tipPointByPosition,
    wageRatesToInsert,
  };
}

/** Strips the sentinel "don't touch this field" values (see
 * readEmployeeForm's optionalTrimmed) out of a Drizzle set()/values()
 * payload — a non-Admin's submission simply never mentions these
 * columns, rather than overwriting them with null. */
function sensitiveFieldsOrUndefined(parsed: ReturnType<typeof readEmployeeForm>, includeSensitive: boolean) {
  if (!includeSensitive) return {};
  return {
    dateOfBirth: parsed.dateOfBirth,
    mobilePhone: parsed.mobilePhone,
    addressLine1: parsed.addressLine1,
    addressLine2: parsed.addressLine2,
    city: parsed.city,
    state: parsed.state,
    zipCode: parsed.zipCode,
    ssnOrItin: parsed.ssnOrItin,
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
    await requireManagerAction();
    const includeSensitive = await isAdminSession();

    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id), includeSensitive);

    const [created] = await db
      .insert(employees)
      .values({
        nickname: parsed.nickname,
        legalFirstName: parsed.legalFirstName,
        legalLastName: parsed.legalLastName,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
        isFinancialAuditor: parsed.isFinancialAuditor,
        isPartner: parsed.isPartner,
        ...sensitiveFieldsOrUndefined(parsed, includeSensitive),
      })
      .returning();
    employeeId = created.id;

    await syncEmployeeChildRows(employeeId, parsed.assignedPositionIds, parsed.tipPointByPosition, parsed.wageRatesToInsert);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/people");
  redirect("/people");
}

export async function updateEmployee(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = Number(formData.get("employeeId"));
  if (!employeeId) return { error: "Missing employee id" };

  try {
    await requireManagerAction();
    const includeSensitive = await isAdminSession();

    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id), includeSensitive);

    await db
      .update(employees)
      .set({
        nickname: parsed.nickname,
        legalFirstName: parsed.legalFirstName,
        legalLastName: parsed.legalLastName,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
        isFinancialAuditor: parsed.isFinancialAuditor,
        isPartner: parsed.isPartner,
        ...sensitiveFieldsOrUndefined(parsed, includeSensitive),
      })
      .where(eq(employees.id, employeeId));

    await syncEmployeeChildRows(employeeId, parsed.assignedPositionIds, parsed.tipPointByPosition, parsed.wageRatesToInsert);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/people");
  redirect("/people");
}

/** Retire/reactivate — never a hard delete, same reasoning and pattern as
 * togglePositionActive. A retired employee stays valid for every
 * historical shift they were rostered on; loadRosterPageData's
 * allEmployees query already filters to active only for NEW roster
 * entries (pre-existing filter, unrelated to this round). */
export async function toggleEmployeeActive(employeeId: number, nextActive: boolean) {
  await requireManagerAction();
  await db.update(employees).set({ active: nextActive }).where(eq(employees.id, employeeId));
  revalidatePath("/people");
}

/** Set or reset an employee's staff-login PIN (2026-08-10) — lets an
 * admin/manager assign a PIN from the Employee admin page without ever
 * touching the DB directly, and gives a path to reset a forgotten one.
 * Same useActionState error pattern as the rest of this file; deliberately
 * a SEPARATE form/action from updateEmployee above rather than one more
 * field on that form — a PIN reset is a distinct, occasional action, not
 * part of the normal "edit this person's info" flow, and keeping it
 * separate means a manager can't accidentally wipe someone's PIN while
 * editing an unrelated field. */
export async function setEmployeePin(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  await requireManagerAction();

  const employeeId = Number(formData.get("employeeId"));
  const pin = String(formData.get("pin") ?? "").trim();

  if (!employeeId) return { error: "Missing employee id" };
  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN must be 4–8 digits" };

  await db.update(employees).set({ pinHash: hashPin(pin) }).where(eq(employees.id, employeeId));

  revalidatePath(`/people/${employeeId}/edit`);
  return { error: null };
}

/** Generate this employee's YK login ID (2026-08-17, Oliver: "build ID
 * and login"). Manual department picker per Oliver's explicit ask (not
 * auto-derived) — the People page pre-fills a best guess
 * (guessLoginIdDepartment) but the manager confirms/overrides it here.
 * The running number is the next value after the current global max
 * (see employees.loginSequence's schema comment) — computed inside the
 * same statement's WHERE-free scan rather than trusting a cached count,
 * so two concurrent generations can't silently collide (a manager
 * clicking twice fast is the realistic case here, not a busy multi-admin
 * race — this app has no such scale yet, but the query itself is cheap
 * either way). Refuses to regenerate an ID that already exists — a
 * generated ID is meant to be stable once assigned (a login credential
 * changing under someone is a real problem, e.g. mid-shift). */
export async function generateLoginId(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  await requireManagerAction();

  const employeeId = Number(formData.get("employeeId"));
  if (!employeeId) return { error: "Missing employee id" };

  const departmentRaw = String(formData.get("department") ?? "");
  if (!LOGIN_ID_DEPARTMENTS.includes(departmentRaw as LoginIdDepartment)) {
    return { error: "Choose a department (Partner / BOH / FOH)" };
  }
  const department = departmentRaw as LoginIdDepartment;

  try {
    const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) return { error: "Employee not found" };
    if (employee.loginId) return { error: "This person already has a login ID — it isn't regenerated once assigned" };

    const [{ maxSequence }] = await db
      .select({ maxSequence: sql<number | null>`max(${employees.loginSequence})` })
      .from(employees);
    const sequence = (maxSequence ?? 0) + 1;

    const loginId = buildLoginId({ hireDate: employee.hireDate, department, sequence });

    await db.update(employees).set({ loginId, loginSequence: sequence }).where(eq(employees.id, employeeId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/people");
  revalidatePath(`/people/${employeeId}/edit`);
  return { error: null };
}

/** Admin-only escape hatch: clears an already-generated login ID so it can
 * be regenerated with a different department (2026-08-17) — mainly for
 * fixing the one-time backfill script's automatic department guess (e.g.
 * a real partner who wasn't marked isPartner yet when the backfill ran).
 * Deliberately Admin-only (stricter than the MANAGER-level
 * requireManagerAction used elsewhere in this file) since a login ID is a
 * live credential — clearing one that's already in someone's hands would
 * lock them out until it's regenerated and re-shared with them, so this
 * shouldn't be a casual one-click action available to every manager. Does
 * NOT free up the running number that was spent — the next generation
 * still gets the next-highest number, same "never reused" reasoning as
 * generateLoginId's own sequencing. */
export async function resetLoginId(employeeId: number): Promise<void> {
  const session = await getCurrentStaffSession();
  if (!session || session.systemRole !== "ADMIN") {
    throw new Error("Not authorized.");
  }
  await db.update(employees).set({ loginId: null }).where(eq(employees.id, employeeId));
  revalidatePath("/people");
  revalidatePath(`/people/${employeeId}/edit`);
}
