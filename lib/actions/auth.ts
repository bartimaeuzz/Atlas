"use server";

/** Staff self-service login/logout (2026-08-10). Same useActionState
 * error-handling pattern as the rest of the app's forms (see
 * lib/actions/shift.ts's saveClosingReportSales for the original
 * reasoning) — a wrong PIN should show inline, not an uncaught error
 * page, especially for a form staff will use unattended at a terminal. */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";
import { verifyPin } from "@/lib/auth/pin";
import { createSession, destroySessionByToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export interface LoginActionState {
  error: string | null;
}

export async function login(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const employeeId = Number(formData.get("employeeId"));
  const pin = String(formData.get("pin") ?? "").trim();

  if (!employeeId) return { error: "Choose your name from the list" };
  if (!pin) return { error: "Enter your PIN" };

  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee || !employee.active) return { error: "That account isn't available — ask a manager" };
  if (!employee.pinHash) return { error: "No PIN has been set for you yet — ask a manager to set one in Employee admin" };

  if (!verifyPin(pin, employee.pinHash)) {
    return { error: "Wrong PIN — try again" };
  }

  const token = await createSession(employee.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 60 * 60, // matches session.ts's SESSION_DURATION_MS
  });

  // Tile home page (2026-08-16): "/" is now a role-aware dashboard —
  // MANAGER/ADMIN see all 7 feature tiles, STAFF see a small 2-tile page
  // (My Schedule / My Pay). Everyone lands there after login now, instead
  // of staff skipping straight to /me — the point of building the staff
  // tile page is that it's actually seen, not bypassed every login.
  redirect("/");
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await destroySessionByToken(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
  redirect("/login");
}
