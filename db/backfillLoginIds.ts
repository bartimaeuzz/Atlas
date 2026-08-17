/**
 * One-time backfill: generate a YK login ID for every existing employee
 * that doesn't have one yet (2026-08-17, Oliver: "auto-generate for
 * everyone right now" rather than generating on demand from the People
 * page). Idempotent — only touches rows where login_id is still null, so
 * it's safe to re-run (e.g. after a new employee is added without a
 * PARTNER/BOH/FOH department resolvable automatically, or after this same
 * zip's migration is re-applied).
 *
 * Department (Partner=0 / BOH=1 / FOH=2) is derived automatically for
 * this backfill, per Oliver's confirmed rule ("add PARTNER"): the new
 * employees.isPartner flag wins if set, otherwise the employee's primary
 * position's FOH/BOH category decides. Going forward, new IDs generated
 * from the People page use the SAME guess as a pre-fill default but let
 * a manager override it — this script has no such override step, since
 * it's meant to run once, unattended, against existing data.
 *
 * Order: hire date ascending (nulls last, then by id) — Oliver's chosen
 * basis for the running number was hire date, but the running number
 * ITSELF is one shared global counter, not reset per hire date (see
 * lib/employees/loginId.ts). Employees with no recorded hire date (true
 * of every seeded employee as of 2026-08-17 -- db/seed.ts never sets it)
 * fall back to today's date for the yr/month portion of their own ID,
 * same fallback loginId.ts's buildLoginId already uses for the on-demand
 * "Generate login ID" button.
 *
 * Run with: npx tsx db/backfillLoginIds.ts
 * (uses the same DATABASE_URL/DATABASE_AUTH_TOKEN already in your shell
 * env -- no different from running db:migrate.)
 */

import { eq, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { employees, positions } from "./schema";
import { buildLoginId, guessLoginIdDepartment } from "../lib/employees/loginId";

async function main() {
  const [{ maxSequence }] = await db.select({ maxSequence: sql<number | null>`max(${employees.loginSequence})` }).from(employees);
  let nextSequence = (maxSequence ?? 0) + 1;

  const allPositions = await db.select().from(positions);
  const positionCategoryById = new Map(allPositions.map((p) => [p.id, p.category as "FOH" | "BOH"]));

  const pending = await db.select().from(employees).where(isNull(employees.loginId));
  if (pending.length === 0) {
    console.log("No employees are missing a login ID -- nothing to do.");
    return;
  }

  // Hire date ascending, nulls last, tie-broken by id (insertion order) --
  // see this file's own doc comment above for why order matters here
  // (assigns the running number) even though hire date isn't reset per
  // department.
  pending.sort((a, b) => {
    if (a.hireDate && b.hireDate) return a.hireDate.localeCompare(b.hireDate) || a.id - b.id;
    if (a.hireDate) return -1;
    if (b.hireDate) return 1;
    return a.id - b.id;
  });

  const now = new Date();
  let generated = 0;
  for (const employee of pending) {
    const positionCategory = employee.primaryPositionId ? positionCategoryById.get(employee.primaryPositionId) ?? null : null;
    const department = guessLoginIdDepartment({ isPartner: employee.isPartner, positionCategory });
    const sequence = nextSequence;
    const loginId = buildLoginId({ hireDate: employee.hireDate, department, sequence, now });

    await db.update(employees).set({ loginId, loginSequence: sequence }).where(eq(employees.id, employee.id));
    console.log(`  ${employee.nickname.padEnd(20)} ${department.padEnd(8)} -> ${loginId}`);

    nextSequence += 1;
    generated += 1;
  }

  console.log(`\nGenerated ${generated} login ID(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
