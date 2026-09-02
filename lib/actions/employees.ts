"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, employeePositions, employeeWageRates, positions } from "@/db/schema";
import { hashPin } from "@/lib/auth/pin";
import { getCurrentStaffSession, deleteSessionsForEmployeeQuery, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
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

interface PersonalInfoAccess {
  canWriteContact: boolean;
  canWriteHrSensitive: boolean;
}

/** Which personal-info tiers this session may write (2026-08-23).
 *
 * Replaces `isAdminSession()`, which was an explicit stopgap ahead of the
 * Permission System actually existing -- it does now, so the check reads
 * the two capabilities the registry has described since Phase B rather
 * than asking whether the caller is an Admin. Oliver's requirement: HR
 * access has to be grantable to a manager from /permissions with no
 * deploy, and any residual `systemRole === "ADMIN"` here would have
 * quietly prevented that. Admins are unaffected -- grantAllows has an
 * ADMIN bypass, so they hold every capability without being named here.
 *
 * Any attempt to set a field from a session without that tier is silently
 * dropped, not just hidden in the UI -- the same double-check discipline
 * used everywhere else sensitive data is written in this app. */
async function personalInfoAccess(): Promise<PersonalInfoAccess> {
  const viewer = await getViewerCapabilities();
  return {
    canWriteContact: viewer?.has("PEOPLE_CONTACT_INFO_VIEW") ?? false,
    canWriteHrSensitive: viewer?.has("PEOPLE_HR_SENSITIVE") ?? false,
  };
}

/** Dead-end prevention (2026-08-17, Oliver: "how admin login in case i'm
 * not admin anymore. if i change my role to staff now. it means no dead
 * end?"). Every manager-facing page and every mutating action in this
 * app (including this very file, which is what edits systemRole) is
 * gated on "is this session MANAGER or ADMIN" -- there's no separate
 * recovery path if that population ever hits zero. Returns true if at
 * least one active MANAGER/ADMIN OTHER than excludeEmployeeId exists --
 * callers use this to block a save that would drop the count to zero. */
async function hasOtherActiveManagerOrAdmin(excludeEmployeeId: number): Promise<boolean> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.active, true), inArray(employees.systemRole, ["MANAGER", "ADMIN"])));
  return rows.some((r) => r.id !== excludeEmployeeId);
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
function readEmployeeForm(formData: FormData, allPositionIds: number[], access: PersonalInfoAccess) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) throw new Error("Nickname/display name is required");

  // Job title (2026-09-01): optional label, empty saves as NULL.
  const titleRaw = String(formData.get("title") ?? "").trim();
  if (titleRaw.length > 60) throw new Error("Title must be 60 characters or fewer");
  const title = titleRaw === "" ? null : titleRaw;

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
  // written) when the acting session holds that TIER's capability. The
  // form won't render a tier this account can't have, but this is the
  // actual enforcement point, not the UI hiding them.
  //
  // Per-tier since 2026-08-23. One shared flag would have let the widened
  // contact-info group write an SSN they are not allowed to read, which is
  // a worse bug than the read-side one this change set out to fix.
  function optionalTrimmed(field: string, allowed: boolean): string | null {
    if (!allowed) return undefined as unknown as string | null; // sentinel: "don't touch this field"
    const v = String(formData.get(field) ?? "").trim();
    return v || null;
  }
  const { canWriteContact, canWriteHrSensitive } = access;
  const dateOfBirth = optionalTrimmed("dateOfBirth", canWriteContact);
  const mobilePhone = optionalTrimmed("mobilePhone", canWriteContact);
  const email = optionalTrimmed("email", canWriteContact);
  const addressLine1 = optionalTrimmed("addressLine1", canWriteHrSensitive);
  const addressLine2 = optionalTrimmed("addressLine2", canWriteHrSensitive);
  const city = optionalTrimmed("city", canWriteHrSensitive);
  const state = optionalTrimmed("state", canWriteHrSensitive);
  const zipCode = optionalTrimmed("zipCode", canWriteHrSensitive);
  const ssnOrItin = optionalTrimmed("ssnOrItin", canWriteHrSensitive);

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
    title,
    legalFirstName,
    legalLastName,
    dateOfBirth,
    mobilePhone,
    email,
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
function sensitiveFieldsOrUndefined(parsed: ReturnType<typeof readEmployeeForm>, access: PersonalInfoAccess) {
  // Each tier contributes its own columns or none at all -- a tier the
  // actor lacks is omitted from the write entirely rather than written as
  // null, so a contact-only editor saving a phone number cannot blank
  // somebody's SSN as a side effect.
  return {
    ...(access.canWriteContact
      ? {
          dateOfBirth: parsed.dateOfBirth,
          mobilePhone: parsed.mobilePhone,
          email: parsed.email,
        }
      : {}),
    ...(access.canWriteHrSensitive
      ? {
          addressLine1: parsed.addressLine1,
          addressLine2: parsed.addressLine2,
          city: parsed.city,
          state: parsed.state,
          zipCode: parsed.zipCode,
          ssnOrItin: parsed.ssnOrItin,
        }
      : {}),
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
    const access = await personalInfoAccess();

    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id), access);

    const [created] = await db
      .insert(employees)
      .values({
        nickname: parsed.nickname,
        title: parsed.title,
        legalFirstName: parsed.legalFirstName,
        legalLastName: parsed.legalLastName,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
        isFinancialAuditor: parsed.isFinancialAuditor,
        isPartner: parsed.isPartner,
        ...sensitiveFieldsOrUndefined(parsed, access),
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
    const access = await personalInfoAccess();

    const [current] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!current) throw new Error("Employee not found");

    const allPositions = await db.select({ id: positions.id }).from(positions);
    const parsed = readEmployeeForm(formData, allPositions.map((p) => p.id), access);

    // Dead-end prevention -- see hasOtherActiveManagerOrAdmin's doc comment.
    // Only relevant when this save would actually DROP the employee out of
    // "active MANAGER/ADMIN" (demoted to STAFF, or retired) -- promoting
    // someone, or any other field edit, never needs this check.
    const wasActiveManagerOrAdmin = current.active && (current.systemRole === "MANAGER" || current.systemRole === "ADMIN");
    const staysActiveManagerOrAdmin = parsed.active && (parsed.systemRole === "MANAGER" || parsed.systemRole === "ADMIN");
    if (wasActiveManagerOrAdmin && !staysActiveManagerOrAdmin) {
      if (!(await hasOtherActiveManagerOrAdmin(employeeId))) {
        throw new Error(
          "Can't save -- this is the last active Manager/Admin account. Promote someone else to Manager or Admin first, or this change would lock everyone out of every manager page."
        );
      }
    }

    await db
      .update(employees)
      .set({
        nickname: parsed.nickname,
        title: parsed.title,
        legalFirstName: parsed.legalFirstName,
        legalLastName: parsed.legalLastName,
        active: parsed.active,
        hireDate: parsed.hireDate,
        primaryPositionId: parsed.primaryPositionId,
        systemRole: parsed.systemRole,
        isFinancialAuditor: parsed.isFinancialAuditor,
        isPartner: parsed.isPartner,
        ...sensitiveFieldsOrUndefined(parsed, access),
      })
      .where(eq(employees.id, employeeId));

    await syncEmployeeChildRows(employeeId, parsed.assignedPositionIds, parsed.tipPointByPosition, parsed.wageRatesToInsert);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/people");
  revalidatePath(`/people/${employeeId}`);
  // Saving lands on the PROFILE, not the list (2026-08-24, Oliver) -- the
  // read-only view is the natural "did my edit take?" check.
  redirect(`/people/${employeeId}`);
}

/** Retire/reactivate — never a hard delete, same reasoning and pattern as
 * togglePositionActive. A retired employee stays valid for every
 * historical shift they were rostered on; loadRosterPageData's
 * allEmployees query already filters to active only for NEW roster
 * entries (pre-existing filter, unrelated to this round).
 *
 * Dead-end prevention (2026-08-17) — retiring the last active
 * MANAGER/ADMIN is the same lockout risk as demoting them via
 * updateEmployee (see hasOtherActiveManagerOrAdmin's doc comment): a
 * retired account can't log in at all (login() checks employee.active),
 * so retiring the last one is just as much a dead end as demoting them
 * to STAFF. Returns an error string instead of throwing — this action is
 * called directly from a client transition (EmployeeToggleActiveButton),
 * not a form action, so the caller needs a value back to show, not an
 * unhandled rejection. */
export async function toggleEmployeeActive(employeeId: number, nextActive: boolean): Promise<{ error: string | null }> {
  await requireManagerAction();

  if (!nextActive) {
    const [current] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (current?.active && (current.systemRole === "MANAGER" || current.systemRole === "ADMIN")) {
      if (!(await hasOtherActiveManagerOrAdmin(employeeId))) {
        return {
          error: "Can't retire — this is the last active Manager/Admin account. Promote someone else first.",
        };
      }
    }
  }

  await db.update(employees).set({ active: nextActive }).where(eq(employees.id, employeeId));
  revalidatePath("/people");
  return { error: null };
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

  // A new PIN also clears any login lockout (2026-09-01) -- "ask a
  // manager to reset your PIN" is the way out the lockout message offers,
  // so the reset must actually open the door, not just change the key.
  // A new PIN signs that person out everywhere (2026-09-01, Oliver) — this
  // is also how a lost phone with a 30-day session gets shut. The session
  // doing the resetting is spared so a manager resetting their OWN PIN is
  // not bounced to /login by their own click. One batch: a changed PIN
  // with the old phone still signed in is the half-state we must not leave.
  const currentToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  await db.batch([
    db
      .update(employees)
      .set({ pinHash: hashPin(pin), loginFailedAttempts: 0, loginLockedUntil: null })
      .where(eq(employees.id, employeeId)),
    deleteSessionsForEmployeeQuery(employeeId, currentToken),
  ]);

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
