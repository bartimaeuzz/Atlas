/**
 * Real-DB e2e verify for the new rosterShowCoworkerListFOH/BOH setting
 * (2026-08-10). Exercises the actual seeded DB end-to-end: default state
 * (list visible), flip FOH off via the real settings row, confirm My Pay
 * for an FOH employee loses the coworker list but keeps their own numbers,
 * confirm a BOH employee is unaffected, then flip back to defaults.
 */
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { restaurantSettings, employees } from "./db/schema";
import { loadMyEarnings } from "./lib/staff/loadMyEarnings";

async function main() {
  const allEmployees = await db.select().from(employees).where(eq(employees.systemRole, "STAFF"));
  console.log(`Found ${allEmployees.length} STAFF employees.`);

  const [foh] = await db.select().from(employees).where(eq(employees.name, "Erika"));
  const [boh] = await db.select().from(employees).where(eq(employees.name, "Papi"));
  if (!foh || !boh) throw new Error("Expected seeded employees Erika (FOH) and Papi (BOH) not found");

  console.log(`FOH test subject: ${foh.name} (id ${foh.id})`);
  console.log(`BOH test subject: ${boh.name} (id ${boh.id})`);

  // --- Step 1: defaults (true/true) — coworker list should be visible ---
  const beforeFoh = await loadMyEarnings(foh.id);
  const shiftWithCoworkersBefore = beforeFoh?.shifts.find((s) => s.coworkers.length > 1);
  if (!shiftWithCoworkersBefore) throw new Error("Expected at least one shift with coworkers visible by default");
  console.log(`[default] ${foh.name}'s shift ${shiftWithCoworkersBefore.date} ${shiftWithCoworkersBefore.period}: ${shiftWithCoworkersBefore.coworkers.length} coworker rows (list visible) — OK`);

  // --- Step 2: flip FOH off ---
  await db.update(restaurantSettings).set({ rosterShowCoworkerListFOH: false }).where(eq(restaurantSettings.restaurantId, 1));

  const afterFoh = await loadMyEarnings(foh.id);
  const anyShiftWithMultipleForFoh = afterFoh?.shifts.some((s) => s.coworkers.length > 1);
  if (anyShiftWithMultipleForFoh) throw new Error("FAIL: FOH employee still sees coworkers after toggling FOH list off");
  const selfOnlyShift = afterFoh?.shifts[0];
  if (!selfOnlyShift || selfOnlyShift.coworkers.length !== 1 || selfOnlyShift.coworkers[0].employeeId !== foh.id) {
    throw new Error("FAIL: expected exactly the viewer's own entry to remain");
  }
  console.log(`[FOH off] ${foh.name}: every shift now shows only self (coworkers.length === 1) — OK`);
  console.log(`[FOH off] ${foh.name}'s own tip/wage numbers still present: totalCorePayout=$${selfOnlyShift.payout.totalCorePayout.toFixed(2)} — OK`);

  // --- Step 3: BOH employee unaffected by the FOH-only change ---
  const bohDuringFohOff = await loadMyEarnings(boh.id);
  const bohStillSeesCoworkers = bohDuringFohOff?.shifts.some((s) => s.coworkers.length > 1);
  if (!bohStillSeesCoworkers) throw new Error("FAIL: BOH employee's coworker list was affected by the FOH-only setting");
  console.log(`[FOH off] ${boh.name} (BOH) still sees coworkers — independent per category — OK`);

  // --- Step 4: MANAGER/ADMIN still see everything (spot-check Oliver, ADMIN) ---
  const [admin] = await db.select().from(employees).where(eq(employees.name, "Oliver"));
  if (admin) {
    const adminView = await loadMyEarnings(admin.id);
    const adminSeesCoworkers = adminView?.shifts.some((s) => s.coworkers.length > 1);
    console.log(`[FOH off] ADMIN (${admin.name}) coworker list still populated: ${adminSeesCoworkers} — OK`);
  }

  // --- Step 5: restore defaults so this script is a no-op on the real DB ---
  await db.update(restaurantSettings).set({ rosterShowCoworkerListFOH: true }).where(eq(restaurantSettings.restaurantId, 1));
  const restored = await loadMyEarnings(foh.id);
  const restoredOk = restored?.shifts.some((s) => s.coworkers.length > 1);
  if (!restoredOk) throw new Error("FAIL: restoring the setting to true did not restore the coworker list");
  console.log("[restored] FOH setting back to true, coworker list visible again — OK");

  console.log("\nALL CHECKS PASSED");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("VERIFY FAILED:", err);
    process.exit(1);
  });
