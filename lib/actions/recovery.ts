"use server";

/**
 * Account recovery code (2026-08-17, Oliver: "What should we do when the
 * admin forgot his password?" — then, correctly: "I ship this app to the
 * customer, and I no longer have access to this product. How do they
 * reset the admin password by themselves?"). Two actions:
 *
 * - generateRecoveryCode: Admin-only, from Settings. Creates/replaces the
 *   restaurant's one recovery code and returns the PLAINTEXT once — never
 *   stored that way, never retrievable again after this response.
 * - redeemRecoveryCode: public (no session — this IS the thing you use
 *   when you have no session), from /login/recover. Verifies the code,
 *   rate-limited (5 wrong tries -> 15 minute lockout, confirmed with
 *   Oliver), and on success resets the chosen employee's PIN in the same
 *   submit — no separate "verified" intermediate session, so there's
 *   nothing extra to secure between steps.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, restaurantSettings } from "@/db/schema";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import { generateRecoveryCodePlaintext, normalizeRecoveryCodeInput } from "@/lib/auth/recoveryCode";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { formatMinutes, lockoutMinutesLeft, recordFailedAttempt } from "@/lib/auth/lockout";

export interface GenerateRecoveryCodeState {
  error: string | null;
  /** Only ever set on a successful generation — the ONE time the
   * plaintext code exists outside this function. */
  code?: string;
}

// Signature is fixed by useActionState's contract (prevState, formData) —
// this action takes no form fields of its own (it's a bare "generate"
// button), so both params below are genuinely unused.
export async function generateRecoveryCode(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GenerateRecoveryCodeState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<GenerateRecoveryCodeState> {
  const session = await getCurrentStaffSession();
  if (!session || session.systemRole !== "ADMIN") {
    return { error: "Only an Admin account can generate a recovery code." };
  }

  const plaintext = generateRecoveryCodePlaintext();
  const hash = hashPin(normalizeRecoveryCodeInput(plaintext));

  await db
    .update(restaurantSettings)
    .set({
      recoveryCodeHash: hash,
      recoveryCodeSetAt: new Date().toISOString(),
      // Generating a fresh code also clears any stale lockout from
      // earlier wrong attempts against the OLD code — the old code no
      // longer works anyway, so there's nothing left to protect by
      // keeping a lockout active.
      recoveryFailedAttempts: 0,
      recoveryLockedUntil: null,
    })
    .where(eq(restaurantSettings.restaurantId, 1));

  return { error: null, code: plaintext };
}

export interface RedeemRecoveryCodeState {
  error: string | null;
  success: boolean;
}

export async function redeemRecoveryCode(
  _prevState: RedeemRecoveryCodeState,
  formData: FormData
): Promise<RedeemRecoveryCodeState> {
  const codeRaw = String(formData.get("code") ?? "");
  const employeeId = Number(formData.get("employeeId"));
  const pin = String(formData.get("pin") ?? "").trim();
  const confirmPin = String(formData.get("confirmPin") ?? "").trim();

  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  if (!settings || !settings.recoveryCodeHash) {
    return {
      error: "No recovery code has been set up for this restaurant yet — ask another Manager or Admin to reset it for you, or generate one from Settings once someone's back in.",
      success: false,
    };
  }

  const now = new Date();

  // Lockout check happens BEFORE touching the submitted code at all — a
  // locked-out attempt shouldn't even get the chance to guess.
  // The rule itself lives in lib/auth/lockout.ts, shared with /login.
  const lockout = { failedAttempts: settings.recoveryFailedAttempts, lockedUntil: settings.recoveryLockedUntil };
  const minutesLeft = lockoutMinutesLeft(lockout, now);
  if (minutesLeft > 0) {
    return { error: `Too many attempts. Try again in ${formatMinutes(minutesLeft)}.`, success: false };
  }

  const normalized = normalizeRecoveryCodeInput(codeRaw);
  const codeIsCorrect = normalized.length > 0 && verifyPin(normalized, settings.recoveryCodeHash);

  if (!codeIsCorrect) {
    const { next, locked } = recordFailedAttempt(lockout, now);
    await db
      .update(restaurantSettings)
      .set({ recoveryFailedAttempts: next.failedAttempts, recoveryLockedUntil: next.lockedUntil })
      .where(eq(restaurantSettings.restaurantId, 1));
    if (locked) {
      return { error: `Too many attempts. Try again in ${formatMinutes(lockoutMinutesLeft(next, now))}.`, success: false };
    }
    return { error: "Incorrect recovery code.", success: false };
  }

  // Code is correct — clear any accumulated failed-attempt state
  // regardless of whether the rest of this submission is valid; a
  // correct code shouldn't leave stale attempt-count baggage around.
  await db
    .update(restaurantSettings)
    .set({ recoveryFailedAttempts: 0, recoveryLockedUntil: null })
    .where(eq(restaurantSettings.restaurantId, 1));

  if (!employeeId) return { error: "Choose which account to reset.", success: false };
  if (!/^\d{4,8}$/.test(pin)) return { error: "New PIN must be 4–8 digits.", success: false };
  if (pin !== confirmPin) return { error: "PINs don't match.", success: false };

  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee || !employee.active) return { error: "That account isn't available.", success: false };

  // Same as setEmployeePin: a fresh PIN clears the login lockout too.
  await db
    .update(employees)
    .set({ pinHash: hashPin(pin), loginFailedAttempts: 0, loginLockedUntil: null })
    .where(eq(employees.id, employeeId));
  await db
    .update(restaurantSettings)
    .set({ recoveryCodeLastUsedAt: now.toISOString(), recoveryCodeLastUsedForEmployeeId: employeeId })
    .where(eq(restaurantSettings.restaurantId, 1));

  return { error: null, success: true };
}
