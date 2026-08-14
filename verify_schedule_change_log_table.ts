/**
 * Diagnostic for the "Failed query: insert into schedule_change_log..."
 * error Oliver hit on the live app (2026-08-14) even after the migration
 * was supposed to be applied. Run with:
 *
 *   npx tsx verify_schedule_change_log_table.ts
 *
 * Uses whatever DATABASE_URL/DATABASE_AUTH_TOKEN are already in your
 * shell env (same as any other npm script) -- reads them, never prints
 * them. Prints:
 *   1. The actual columns Turso has for schedule_change_log right now
 *      (in case migration 0007 partially applied -- this project has
 *      hit that exact failure mode before with Turso's HTTP protocol).
 *   2. A real insert using a real employee id from your data, wrapped
 *      in try/catch that prints EVERY property of the error object
 *      (message, code, cause) instead of just .message, so we get the
 *      actual reason this time instead of the generic "Failed query"
 *      wrapper.
 *   3. Cleans up the test row it inserted (or tells you it couldn't).
 *
 * Delete this file after use, same as the project's other verify_*.ts
 * scripts.
 */
import { db } from "./db/client";
import { employees, scheduleChangeLog } from "./db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("--- 1. Actual columns on schedule_change_log (from Turso right now) ---");
  const cols = await db.$client.execute("PRAGMA table_info(schedule_change_log)");
  for (const row of cols.rows) {
    console.log(` ${row.name}  (${row.type}, notnull=${row.notnull})`);
  }
  if (cols.rows.length === 0) {
    console.log("!! Table has ZERO columns reported -- it may not actually exist despite migrate reporting Done.");
  }

  console.log("\n--- 2. Test insert ---");
  const [anyEmployee] = await db.select({ id: employees.id, name: employees.name }).from(employees).limit(1);
  if (!anyEmployee) {
    console.log("No employees in this DB at all -- can't test the FK. Stopping here.");
    return;
  }
  console.log(`Using employee id=${anyEmployee.id} (${anyEmployee.name}) to satisfy the FK.`);

  try {
    const [inserted] = await db
      .insert(scheduleChangeLog)
      .values({
        weekId: 999999, // deliberately fake -- no FK on weekId by design, should NOT be what fails
        weekStartDate: "2099-01-05",
        action: "CLEARED_DAY",
        date: "2099-01-05",
        wasPublished: false,
        reason: null,
        performedByEmployeeId: anyEmployee.id,
        performedByName: anyEmployee.name,
        removedAssignments: JSON.stringify([{ employeeId: anyEmployee.id, employeeName: anyEmployee.name, positionId: 1, positionName: "Test", date: "2099-01-05", period: "Lunch" }]),
      })
      .returning();
    console.log("INSERT SUCCEEDED:", inserted);
    await db.delete(scheduleChangeLog).where(eq(scheduleChangeLog.id, inserted.id));
    console.log("Test row cleaned up. Table is working correctly -- whatever Oliver hit may have been a one-off.");
  } catch (e) {
    console.log("INSERT FAILED -- full error detail below:");
    if (e instanceof Error) {
      console.log("message:", e.message);
      console.log("name:", e.name);
      console.log("code:", (e as { code?: unknown }).code);
      console.log("cause:", (e as { cause?: unknown }).cause);
      console.log("stack:", e.stack);
    } else {
      console.log(e);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
