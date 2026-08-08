import { db } from "./client";
import {
  positions, positionTipPools, employees, employeePositions, positionShiftRates,
  restaurantSettings, shifts, shiftRosterEntries, shiftSales,
  metricDefinitions, employeeWageRates, onlinePlatforms,
} from "./schema";
import { sql } from "drizzle-orm";

async function seed() {
  // Safe to run this more than once — clears everything first (children
  // before parents) instead of erroring on duplicate inserts. You do NOT
  // need to delete db/atlas.db by hand or re-run db:push every time; this
  // alone resets the sample data.
  const tableNames = [
    "incentive_payout_records", "employee_rule_weights", "incentive_rule_targets",
    "incentive_rule_conditions", "incentive_rules", "metric_values", "metric_definitions",
    "delivery_cash_tip_records", "tip_pool_calculations", "employee_payouts",
    "host_upsell_tip_records", "online_platform_sales_records", "shift_sales",
    "shift_roster_entries", "shifts", "employee_wage_rates", "position_shift_rates",
    "employee_positions", "employees", "online_platforms", "position_tip_pools",
    "positions", "sections", "restaurant_settings",
  ];
  for (const t of tableNames) db.run(sql.raw(`DELETE FROM ${t}`));
  // Also reset the autoincrement counters, so re-seeding always produces the
  // same ids (shift 1, employee 1, etc.) instead of climbing forever —
  // otherwise /shifts/1 would silently break the second time you seed.
  for (const t of tableNames) db.run(sql.raw(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));

  await db.insert(restaurantSettings).values({
    restaurantId: 1,
    ccTipDeductionRate: 0.045,
    rosterShowPeerEarningsFOH: true,
    rosterShowPeerEarningsBOH: false,
  });

  // Confirmed 2026-08-05: 4 online platforms, Bento no longer active.
  await db.insert(onlinePlatforms).values([
    { restaurantId: 1, name: "Grubhub" },
    { restaurantId: 1, name: "UberEats" },
    { restaurantId: 1, name: "DoorDash" },
    { restaurantId: 1, name: "HungryPanda" },
  ]);

  // --- Positions ---
  // Corrected 2026-08-08: Host is ONE position that belongs to TWO tip pools
  // (see positionTipPools inserts below) — no longer split into "Host" +
  // "Host (Takeout/Online)". That split caused a real bug: a manager could
  // add someone as Host without remembering the second row, silently
  // dropping their Pool 2 share.
  const [server] = await db.insert(positions).values({ name: "Server", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [bartender] = await db.insert(positions).values({ name: "Bartender", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [host] = await db.insert(positions).values({ name: "Host", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [runner] = await db.insert(positions).values({ name: "Runner", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [busser] = await db.insert(positions).values({ name: "Busser", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [operator] = await db.insert(positions).values({ name: "Operator", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [packer] = await db.insert(positions).values({ name: "Packer", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [bagHandler] = await db.insert(positions).values({ name: "Bag Handler", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [manager] = await db.insert(positions).values({ name: "Manager", category: "FOH", alwaysVisibleInRoster: true, earningsHiddenFromStaff: true, defaultTipPointValue: null }).returning();
  const [floorManager] = await db.insert(positions).values({ name: "Floor Manager", category: "FOH", alwaysVisibleInRoster: true, earningsHiddenFromStaff: true, defaultTipPointValue: null }).returning();
  // Youk Thai doesn't have this role yet, but the position exists so the
  // system is ready when a busier restaurant (or a future customer) needs it.
  const [deliveryGuy] = await db.insert(positions).values({ name: "Delivery Guy", category: "FOH", defaultTipPointValue: null }).returning();
  const [chef] = await db.insert(positions).values({ name: "Chef", category: "BOH", defaultTipPointValue: null }).returning();
  const [lineCook] = await db.insert(positions).values({ name: "Line Cook", category: "BOH", defaultTipPointValue: null }).returning();

  await db.insert(positionTipPools).values([
    { positionId: server.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: bartender.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: host.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: host.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" }, // Host spans both pools
    { positionId: runner.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: busser.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: operator.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: packer.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: bagHandler.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: deliveryGuy.id, tipPoolGroup: "POOL_3_DELIVERY" },
    // Manager, Floor Manager, Chef, Line Cook: no rows here = no tip pool.
  ]);

  await db.insert(positionShiftRates).values([
    { positionId: server.id, period: "Lunch", flatRate: 50 },
    { positionId: server.id, period: "Dinner", flatRate: 60 },
    { positionId: bartender.id, period: "Lunch", flatRate: 50 },
    { positionId: bartender.id, period: "Dinner", flatRate: 70 },
    { positionId: host.id, period: "Lunch", flatRate: 45 },
    { positionId: host.id, period: "Dinner", flatRate: 55 },
    { positionId: runner.id, period: "Lunch", flatRate: 40 },
    { positionId: runner.id, period: "Dinner", flatRate: 50 },
    { positionId: busser.id, period: "Lunch", flatRate: 40 },
    { positionId: busser.id, period: "Dinner", flatRate: 50 },
  ]);

  const [aey] = await db.insert(employees).values({ name: "Aey", primaryPositionId: bartender.id }).returning();
  const [erika] = await db.insert(employees).values({ name: "Erika", primaryPositionId: host.id }).returning();
  const [kris] = await db.insert(employees).values({ name: "Kris", primaryPositionId: server.id }).returning();
  const [chui] = await db.insert(employees).values({ name: "Chui", primaryPositionId: server.id }).returning();
  const [film] = await db.insert(employees).values({ name: "Film", primaryPositionId: runner.id }).returning();
  const [alesso] = await db.insert(employees).values({ name: "Alesso", primaryPositionId: busser.id }).returning();
  const [bomb] = await db.insert(employees).values({ name: "Bomb", primaryPositionId: chef.id, systemRole: "MANAGER" }).returning(); // shift lead, sees everything
  const [papi] = await db.insert(employees).values({ name: "Papi", primaryPositionId: lineCook.id }).returning();

  await db.insert(employeePositions).values([
    { employeeId: aey.id, positionId: bartender.id, tipPointValue: 1.0 },
    { employeeId: aey.id, positionId: host.id, tipPointValue: 1.0 },
    { employeeId: erika.id, positionId: host.id, tipPointValue: 1.0 },
    { employeeId: kris.id, positionId: server.id, tipPointValue: 0.8 },
    { employeeId: chui.id, positionId: server.id, tipPointValue: 1.0 },
    { employeeId: film.id, positionId: runner.id, tipPointValue: 1.0 },
    { employeeId: alesso.id, positionId: busser.id, tipPointValue: 1.0 },
  ]);

  const [dinnerShift] = await db.insert(shifts).values({ date: "2026-08-08", period: "Dinner", status: "draft" }).returning();

  await db.insert(shiftRosterEntries).values([
    { shiftId: dinnerShift.id, employeeId: aey.id, positionId: bartender.id },
    { shiftId: dinnerShift.id, employeeId: erika.id, positionId: host.id }, // one row now covers Pool 1 + Pool 2
    { shiftId: dinnerShift.id, employeeId: kris.id, positionId: server.id },
    { shiftId: dinnerShift.id, employeeId: chui.id, positionId: server.id },
    { shiftId: dinnerShift.id, employeeId: film.id, positionId: runner.id },
    { shiftId: dinnerShift.id, employeeId: alesso.id, positionId: busser.id },
    { shiftId: dinnerShift.id, employeeId: bomb.id, positionId: chef.id },
    { shiftId: dinnerShift.id, employeeId: papi.id, positionId: lineCook.id },
  ]);

  // BOH wages are individual per person, per period — not shared like FOH.
  await db.insert(employeeWageRates).values([
    { employeeId: bomb.id, positionId: chef.id, period: "Dinner", rate: 100 },
    { employeeId: papi.id, positionId: lineCook.id, period: "Dinner", rate: 55 },
  ]);

  await db.insert(shiftSales).values({
    shiftId: dinnerShift.id,
    totalSales: 4200,
    ccTipTotal: 630,
    takeoutCcTip: 45,
    cashSales: 300,
    grossFoodSales: 3400,
    grossBeverageSales: 800,
  });

  await db.insert(metricDefinitions).values([
    { key: "total_sales", label: "Total sales", valueType: "money", scope: "SHIFT", collectionMoment: "close", required: true, enabled: true },
    { key: "host_qualifying_drink_count", label: "Host cocktail/mocktail count", valueType: "count", scope: "EMPLOYEE_SHIFT", collectionMoment: "close", required: false, enabled: true },
    { key: "manager_shift_worked", label: "Manager shift worked (token)", valueType: "count", scope: "EMPLOYEE_SHIFT", collectionMoment: "manual", required: false, enabled: true },
  ]);

  console.log("Seed complete. Dinner shift id:", dinnerShift.id, "| Delivery Guy position id (unstaffed today):", deliveryGuy.id);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
