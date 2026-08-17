/**
 * YK login ID (2026-08-17, Oliver: "build ID and login. format YK with 2
 * digit yr 2 digit month 1 digit departmemt 0=admin 1=partner 2=BOH 3=FOH
 * and 3 digit running number") — refined in conversation to a final
 * 3-department scheme (Admin isn't a department, it's a login
 * PERMISSION via employees.systemRole, so it doesn't get a digit here):
 *
 *   YK <hire year, 2 digit> <hire month, 2 digit> <dept, 1 digit> <running #, 3 digit>
 *   dept: 0 = Partner, 1 = BOH, 2 = FOH
 *
 * e.g. a Partner hired August 2026, the 7th ID ever generated (any
 * department): YK260807.
 *
 * The running number is ONE shared global counter across all three
 * departments, never resets (Oliver: "one shared global counter (never
 * resets)") — see employees.loginSequence's schema comment for why the
 * sequence value itself is stored rather than re-derived from the string.
 */

export const LOGIN_ID_DEPARTMENTS = ["PARTNER", "BOH", "FOH"] as const;
export type LoginIdDepartment = (typeof LOGIN_ID_DEPARTMENTS)[number];

const DEPARTMENT_DIGIT: Record<LoginIdDepartment, string> = {
  PARTNER: "0",
  BOH: "1",
  FOH: "2",
};

export interface BuildLoginIdInput {
  /** ISO date string (YYYY-MM-DD). Employees without a recorded hire date
   * fall back to the date the ID is generated — see buildLoginId's
   * fallback note below. */
  hireDate: string | null;
  department: LoginIdDepartment;
  /** The running-number value to encode, 1-based. Not auto-incremented
   * here — the caller (lib/actions/employees.ts's generateLoginId, or
   * db/backfillLoginIds.ts) is responsible for computing
   * MAX(loginSequence)+1 first. */
  sequence: number;
  /** Only used when hireDate is null — defaults to `new Date()`, injected
   * so this stays a pure, testable function. */
  now?: Date;
}

/** Builds the "YK..." string. Does not touch the database — callers
 * persist both the returned id AND the sequence number they passed in. */
export function buildLoginId({ hireDate, department, sequence, now }: BuildLoginIdInput): string {
  if (sequence < 1 || !Number.isInteger(sequence)) {
    throw new Error("Login ID sequence must be a positive integer");
  }
  if (sequence > 999) {
    // Deliberately not handled beyond this — see db/backfillLoginIds.ts /
    // generateLoginId's doc comments. 999 employees is far beyond this
    // app's current scale; revisit the format if it's ever actually hit.
    throw new Error("Login ID running number exceeded 999 — format needs revisiting");
  }

  const date = hireDate ? new Date(hireDate + "T00:00:00Z") : (now ?? new Date());
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid hire date for login ID: ${hireDate}`);
  }
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const deptDigit = DEPARTMENT_DIGIT[department];
  const seq = String(sequence).padStart(3, "0");

  return `YK${yy}${mm}${deptDigit}${seq}`;
}

/** Best-guess department for pre-filling the "Generate login ID" dialog —
 * NOT auto-applied without confirmation (Oliver's ask was a manual picker
 * at generation time). Partner flag wins if set; otherwise falls back to
 * the employee's position category. */
export function guessLoginIdDepartment(input: { isPartner: boolean; positionCategory: "FOH" | "BOH" | null }): LoginIdDepartment {
  if (input.isPartner) return "PARTNER";
  if (input.positionCategory === "BOH") return "BOH";
  return "FOH";
}
