import { db } from "./client";
import {
  positions, positionTipPools, employees, employeePositions, positionShiftRates,
  restaurantSettings, shifts, shiftRosterEntries, shiftSales, onlinePlatformSalesRecords,
  metricDefinitions, positionMetrics, metricValues, employeeWageRates, onlinePlatforms,
  incentiveRules, incentiveRuleConditions, incentiveRuleTargets,
  ledgerVendors, ledgerCategories,
} from "./schema";
import { sql, eq } from "drizzle-orm";
import { hashPin } from "../lib/auth/pin";
import { finalizeShiftWrites } from "../lib/shift/finalizeShiftWrites";

async function seed() {
  // Safe to run this more than once — clears everything first (children
  // before parents) instead of erroring on duplicate inserts. You do NOT
  // need to delete db/atlas.db by hand or re-run db:push every time; this
  // alone resets the sample data.
  const tableNames = [
    "staff_sessions",
    "incentive_payout_records", "employee_rule_weights", "incentive_rule_targets",
    "incentive_rule_conditions", "incentive_rules", "metric_values", "position_metrics",
    "metric_definitions",
    "delivery_cash_tip_records", "tip_pool_calculations", "employee_payouts",
    "shift_wage_adjustments",
    "host_upsell_tip_records", "online_platform_sales_records", "shift_sales",
    "shift_roster_entries", "shifts", "employee_wage_rates", "position_shift_rates",
    "employee_positions", "employees", "online_platforms", "position_tip_pools",
    "positions", "sections", "restaurant_settings",
    "petty_cash_entries", "daily_cash_reconciliations", "ledger_vendors", "ledger_categories",
  ];
  // Sequential + awaited on purpose: order matters (children before parents,
  // FK-safe), and since the libSQL driver migration (2026-08-10) db.run()
  // is async — an unawaited loop here fires all deletes without waiting,
  // racing the inserts below and leaving stale rows behind.
  for (const t of tableNames) await db.run(sql.raw(`DELETE FROM ${t}`));
  for (const t of tableNames) await db.run(sql.raw(`DELETE FROM sqlite_sequence WHERE name = '${t}'`));

  await db.insert(restaurantSettings).values({
    restaurantId: 1,
    ccTipDeductionRate: 0.045,
    // Split 2026-08-10 into independent Tip/Wage toggles — same values as
    // before for both, so Youk Thai's seeded behavior is unchanged.
    rosterShowPeerTipFOH: true,
    rosterShowPeerTipBOH: false,
    rosterShowPeerWageFOH: true,
    rosterShowPeerWageBOH: false,
    pool1SplitMethod: "POINT_WEIGHTED",
    pool2SplitMethod: "POINT_WEIGHTED",
    pool3SplitMethod: "EQUAL_SPLIT",
    hostDrinkBonusPerDrinkAmount: 1.0,
    // 8.875% — NYC's combined state+city sales tax rate, confirmed against
    // Oliver's real MARCH 2026.xlsx report (Tax / Net Sale comes out to
    // 0.08875 on every row). 2026-08-10, sales/tax export feature.
    defaultSalesTaxRate: 0.08875,
  });

  // Ledger v1 (2026-08-14) -- categories from Soothr's real Dropdown
  // sheet, vendors from Soothr's real Supplier Check/Card vendor lists.
  // Seeded "for testing sake" (Oliver's words) -- Youk Thai is expected
  // to edit/replace these with its own real vendors before going live,
  // same DNA-is-a-guideline precedent as everywhere else in this app.
  // pnlGroup tags added 2026-08-16 for the Analytics/P&L feature -- Bar is
  // alcohol/bar-program (BEVERAGE_ALC), Drinks is non-alcoholic soda/soft
  // drinks (BEVERAGE_NONALC, a new category added for this feature, split
  // out from Food per Aey's request), PAYROLL BOH/FOH are EXCLUDED from the
  // P&L rollup since Atlas's own computed shift-wage data is the payroll
  // source of truth instead (see ledgerCategories' schema comment).
  await db.insert(ledgerCategories).values([
    { name: "Bar", pnlGroup: "BEVERAGE_ALC" },
    { name: "Food", pnlGroup: "FOOD" },
    { name: "Drinks", pnlGroup: "BEVERAGE_NONALC" },
    { name: "Mis", pnlGroup: "OTHER_EXPENSE" },
    { name: "PAYROLL BOH", pnlGroup: "EXCLUDED" },
    { name: "PAYROLL FOH", pnlGroup: "EXCLUDED" },
    { name: "Fixed expenses", pnlGroup: "OTHER_EXPENSE" },
    { name: "Car", pnlGroup: "OTHER_EXPENSE" },
    { name: "SHM", pnlGroup: "OTHER_EXPENSE" },
  ]);
  await db.insert(ledgerVendors).values(
    [
      "NY Mutual Trading, Inc.",
      "Kyodo Beverage Co., Inc.",
      "The Haisein Company",
      "Wismettac Asian Foods, Inc.",
      "K.D. Market",
      "Asia Market Corporation",
      "Best Metropolitan Towel & Linen Supply",
      "J and J",
      "Jitto Group",
      "Sappesuk Limited",
      "East Sunshine Inc",
      "Auto-Chlor",
      "Standard Security",
      "OAK Beverage",
      "Sappe",
      "Gabriella Wines",
      "Gabriella Fine Wines",
      "Union Beer / Auto Tap",
      "Empire Merchants",
      "S.K.I. Beer Corp.",
      "Soilair (Bacchus Import)",
      "Southern Wine (SGWS)",
      "Baldor",
      "Skyfoods",
      "Bronx Freight and Fish",
      "True World Foods",
      "Amazon",
    ].map((name) => {
      // Addresses below are real, taken directly from the DNA file's own
      // "Export" check-writing sheet (2026-08-14, added for the Supplier
      // Check report/export follow-up) -- confirmed by re-opening
      // " 2026 - C.xlsx" rather than assuming. Other vendors are left
      // without an address; edit them in /ledger/vendors when a real one
      // is known.
      const addresses: Record<string, { payeeAddressLine1: string; payeeAddressLine2: string }> = {
        "NY Mutual Trading, Inc.": { payeeAddressLine1: "77 Metro Way", payeeAddressLine2: "Secaucus, NJ 07094" },
        "Asia Market Corporation": { payeeAddressLine1: "71 1/2 Mulberry Street", payeeAddressLine2: "New York, NY 10013" },
        "Best Metropolitan Towel & Linen Supply": { payeeAddressLine1: "61 Madison Avenue", payeeAddressLine2: "Hempstead, NY 11550" },
        "K.D. Market": { payeeAddressLine1: "88 Mulberry Street", payeeAddressLine2: "New York, NY 10013" },
        "The Haisein Company": { payeeAddressLine1: "59-45 54th Street", payeeAddressLine2: "Maspeth, NY 11378" },
      };
      return addresses[name] ? { name, ...addresses[name] } : { name };
    })
  );

  await db.insert(onlinePlatforms).values([
    { restaurantId: 1, name: "Grubhub" },
    { restaurantId: 1, name: "UberEats" },
    { restaurantId: 1, name: "DoorDash" },
    { restaurantId: 1, name: "HungryPanda" },
  ]);

  /* ------------------------------------------------------------------ */
  /* Positions + employees — REBASED 2026-08-10 to match Oliver's real,  */
  /* hand-built team (19 employees, 17 positions) instead of the small   */
  /* original 8-person sample. Oliver explicitly asked for this: he'd    */
  /* been manually rebuilding this exact roster by hand every time a     */
  /* schema change forced a reseed. Numbers below (FOH flat rates, tip   */
  /* pool membership) are copied directly from his live Position admin   */
  /* screen; BOH wage ($100 Lunch / $200 Dinner flat for everyone) is    */
  /* his own explicit placeholder, not meant to be realistic per-person  */
  /* variation yet — see PROGRESS.md.                                    */
  /* ------------------------------------------------------------------ */

  const [bagHandler] = await db.insert(positions).values({ name: "Bag Handler", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [bartender] = await db.insert(positions).values({ name: "Bartender", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [busser] = await db.insert(positions).values({ name: "Busser", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [deliveryGuy] = await db.insert(positions).values({ name: "Delivery Guy", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [floorManager] = await db.insert(positions).values({ name: "Floor Manager", category: "FOH", alwaysVisibleInRoster: true, earningsHiddenFromStaff: true, grantsManagerAccess: true, defaultTipPointValue: null }).returning();
  const [host] = await db.insert(positions).values({ name: "Host", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [manager] = await db.insert(positions).values({ name: "Manager", category: "FOH", alwaysVisibleInRoster: true, earningsHiddenFromStaff: true, grantsManagerAccess: true, defaultTipPointValue: null }).returning();
  const [operator] = await db.insert(positions).values({ name: "Operator", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [packer] = await db.insert(positions).values({ name: "Packer", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  // Corrected 2026-08-10 (Oliver flagged this himself): Pastry Chef is
  // BOH, not FOH — a misreading of his live Position admin screen in the
  // previous round's seed rewrite. BOH wage is per-employee via
  // employeeWageRates below, same as the other kitchen positions, not a
  // shared flat rate.
  const [pastryChef] = await db.insert(positions).values({ name: "Pastry Chef", category: "BOH", defaultTipPointValue: null }).returning();
  const [runner] = await db.insert(positions).values({ name: "Runner", category: "FOH", defaultTipPointValue: 1.0 }).returning();
  const [server] = await db.insert(positions).values({ name: "Server", category: "FOH", defaultTipPointValue: 1.0 }).returning();

  const [dishwasher] = await db.insert(positions).values({ name: "Dishwasher", category: "BOH", defaultTipPointValue: null }).returning();
  const [headChef] = await db.insert(positions).values({ name: "Head Chef", category: "BOH", defaultTipPointValue: null }).returning();
  const [lineCook] = await db.insert(positions).values({ name: "Line Cook", category: "BOH", defaultTipPointValue: null }).returning();
  const [prep] = await db.insert(positions).values({ name: "Prep", category: "BOH", defaultTipPointValue: null }).returning();
  const [sousChef] = await db.insert(positions).values({ name: "Sous Chef", category: "BOH", defaultTipPointValue: null }).returning();

  // Tip pool membership — matches Oliver's live Position admin exactly.
  // BOH positions have none (Youk Thai doesn't tip out BOH at all — see
  // the schema memory's confirmed business rule).
  await db.insert(positionTipPools).values([
    { positionId: bagHandler.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: bartender.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: busser.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: deliveryGuy.id, tipPoolGroup: "POOL_3_DELIVERY" },
    { positionId: host.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: host.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: operator.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: packer.id, tipPoolGroup: "POOL_2_TAKEOUT_ONLINE" },
    { positionId: runner.id, tipPoolGroup: "POOL_1_DINE_IN" },
    { positionId: server.id, tipPoolGroup: "POOL_1_DINE_IN" },
    // Floor Manager, Manager, Pastry Chef, all BOH: no rows = no tip pool.
  ]);

  // FOH flat rates — copied directly from Oliver's live Position admin.
  await db.insert(positionShiftRates).values([
    { positionId: bagHandler.id, period: "Lunch", flatRate: 50 },
    { positionId: bagHandler.id, period: "Dinner", flatRate: 50 },
    { positionId: bartender.id, period: "Lunch", flatRate: 50 },
    { positionId: bartender.id, period: "Dinner", flatRate: 70 },
    { positionId: busser.id, period: "Lunch", flatRate: 40 },
    { positionId: busser.id, period: "Dinner", flatRate: 50 },
    { positionId: deliveryGuy.id, period: "Lunch", flatRate: 40 },
    { positionId: deliveryGuy.id, period: "Dinner", flatRate: 50 },
    { positionId: floorManager.id, period: "Lunch", flatRate: 100 },
    { positionId: floorManager.id, period: "Dinner", flatRate: 140 },
    { positionId: host.id, period: "Lunch", flatRate: 60 },
    { positionId: host.id, period: "Dinner", flatRate: 60 },
    // Manager: no rate rows — matches Oliver's live data ("— / —"), no one
    // is currently staffed there so it's never been set.
    { positionId: operator.id, period: "Lunch", flatRate: 50 },
    { positionId: operator.id, period: "Dinner", flatRate: 50 },
    { positionId: packer.id, period: "Lunch", flatRate: 50 },
    { positionId: packer.id, period: "Dinner", flatRate: 60 },
    // Pastry Chef removed from here (2026-08-10 fix) — it's BOH now, paid
    // via employeeWageRates below, not a shared FOH flat rate.
    { positionId: runner.id, period: "Lunch", flatRate: 40 },
    { positionId: runner.id, period: "Dinner", flatRate: 50 },
    { positionId: server.id, period: "Lunch", flatRate: 50 },
    { positionId: server.id, period: "Dinner", flatRate: 60 },
  ]);

  // 19 employees, matching Oliver's live Employee admin roster exactly
  // (names, primary position, system role). Secondary position
  // assignments (e.g. Aey covering Server/Host/Packer/Floor Manager on
  // top of her primary Bartender) are recorded in employeePositions below
  // so they show correctly in Employee admin and the roster dropdown, but
  // the SEEDED SHIFTS only staff each person at their PRIMARY position —
  // see the shift-building loop below for why.
  // CORRECTED again 2026-08-10, same day: Oliver clarified (in Thai,
  // after a language-barrier round trip) that Aey is actually a
  // RESTAURANT PARTNER who works the floor in various positions day to
  // day — her elevated access is a standing fact about who she is, not
  // something that should turn on/off based on which position she
  // happens to be rostered at on a given shift. So this DOES go back to
  // a fixed systemRole: MANAGER (the previous round's "fix" wrongly
  // assumed her Floor Manager access should be shift-scoped like a
  // regular staff member occasionally covering that role — it should
  // NOT be, for a partner). The shift-scoped `grantsManagerAccess`
  // mechanism (positions.grantsManagerAccess, see schema comment) is
  // KEPT, not removed — it still correctly covers a DIFFERENT real
  // scenario: an ordinary STAFF employee filling in as Floor Manager for
  // one shift should still see everything for that shift, same
  // shift-coverage precedent as elsewhere in this app. Aey just doesn't
  // need to rely on it, since her standing role already covers her.
  // isFinancialAuditor (2026-08-15): Aey is the real-world financial
  // auditor for Youk Thai per Oliver -- her PIN doubles as the
  // confirmation code required to edit an already Printed/Paid Supplier
  // Check invoice (see editSupplierInvoice in lib/actions/supplierCheck.ts).
  // Seeded here for local testing only -- Oliver still needs to check
  // the "Financial auditor" box on his REAL Aey employee record via
  // /employees, since seed.ts never touches his production database.
  const [aey] = await db
    .insert(employees)
    .values({ nickname: "Aey", primaryPositionId: bartender.id, systemRole: "MANAGER", isFinancialAuditor: true })
    .returning();
  const [alesso] = await db.insert(employees).values({ nickname: "Alesso", primaryPositionId: busser.id }).returning();
  const [bomb] = await db.insert(employees).values({ nickname: "Bomb", primaryPositionId: headChef.id }).returning();
  const [carlos] = await db.insert(employees).values({ nickname: "Carlos", primaryPositionId: deliveryGuy.id }).returning();
  const [chong] = await db.insert(employees).values({ nickname: "Chong", primaryPositionId: pastryChef.id }).returning();
  const [chui] = await db.insert(employees).values({ nickname: "Chui", primaryPositionId: server.id }).returning();
  const [erika] = await db.insert(employees).values({ nickname: "Erika", primaryPositionId: host.id }).returning();
  const [film] = await db.insert(employees).values({ nickname: "Film", primaryPositionId: runner.id }).returning();
  const [game] = await db.insert(employees).values({ nickname: "Game", primaryPositionId: sousChef.id }).returning();
  const [gunner] = await db.insert(employees).values({ nickname: "Gunner", primaryPositionId: bagHandler.id }).returning();
  const [jose] = await db.insert(employees).values({ nickname: "Jose", primaryPositionId: dishwasher.id }).returning();
  const [juan] = await db.insert(employees).values({ nickname: "Juan", primaryPositionId: prep.id }).returning();
  const [kris] = await db.insert(employees).values({ nickname: "Kris", primaryPositionId: server.id }).returning();
  const [meji] = await db.insert(employees).values({ nickname: "Meji", primaryPositionId: host.id }).returning();
  const [nancy] = await db.insert(employees).values({ nickname: "Nancy", primaryPositionId: floorManager.id }).returning();
  const [oliver] = await db.insert(employees).values({ nickname: "Oliver", primaryPositionId: bartender.id, systemRole: "ADMIN" }).returning();
  const [papi] = await db.insert(employees).values({ nickname: "Papi", primaryPositionId: lineCook.id }).returning();
  const [sammuel] = await db.insert(employees).values({ nickname: "Sammuel", primaryPositionId: deliveryGuy.id }).returning();
  const [wiinchy] = await db.insert(employees).values({ nickname: "Wiinchy", primaryPositionId: bartender.id }).returning();

  // Standing position assignments — tipPointValue defaults to 1.0 for
  // everyone except Kris (kept at 0.8, a deliberate variance carried over
  // from the original seed, so point-weighted split math still has a
  // non-uniform case to visibly exercise).
  await db.insert(employeePositions).values([
    { employeeId: aey.id, positionId: bartender.id, tipPointValue: 1.0 },
    { employeeId: aey.id, positionId: server.id, tipPointValue: 1.0 },
    { employeeId: aey.id, positionId: host.id, tipPointValue: 1.0 },
    { employeeId: aey.id, positionId: packer.id, tipPointValue: 1.0 },
    { employeeId: aey.id, positionId: floorManager.id, tipPointValue: 1.0 },
    { employeeId: alesso.id, positionId: busser.id, tipPointValue: 1.0 },
    { employeeId: bomb.id, positionId: headChef.id, tipPointValue: 1.0 },
    { employeeId: carlos.id, positionId: deliveryGuy.id, tipPointValue: 1.0 },
    { employeeId: chong.id, positionId: pastryChef.id, tipPointValue: 1.0 },
    { employeeId: chui.id, positionId: server.id, tipPointValue: 1.0 },
    { employeeId: erika.id, positionId: host.id, tipPointValue: 1.0 },
    { employeeId: film.id, positionId: runner.id, tipPointValue: 1.0 },
    { employeeId: game.id, positionId: sousChef.id, tipPointValue: 1.0 },
    { employeeId: gunner.id, positionId: bagHandler.id, tipPointValue: 1.0 },
    { employeeId: jose.id, positionId: dishwasher.id, tipPointValue: 1.0 },
    { employeeId: juan.id, positionId: prep.id, tipPointValue: 1.0 },
    { employeeId: kris.id, positionId: server.id, tipPointValue: 0.8 },
    { employeeId: meji.id, positionId: host.id, tipPointValue: 1.0 },
    { employeeId: nancy.id, positionId: server.id, tipPointValue: 1.0 },
    { employeeId: nancy.id, positionId: floorManager.id, tipPointValue: 1.0 },
    { employeeId: oliver.id, positionId: server.id, tipPointValue: 1.0 },
    { employeeId: oliver.id, positionId: bartender.id, tipPointValue: 1.0 },
    { employeeId: papi.id, positionId: lineCook.id, tipPointValue: 1.0 },
    { employeeId: sammuel.id, positionId: deliveryGuy.id, tipPointValue: 1.0 },
    { employeeId: wiinchy.id, positionId: bartender.id, tipPointValue: 1.0 },
  ]);

  // BOH wage — Oliver's explicit placeholder: $100 Lunch / $200 Dinner
  // flat for every BOH employee at their primary position, "for now"
  // (not meant to reflect real per-person variation yet — see
  // PROGRESS.md/schema memory's note on real BOH wage splitting unevenly
  // by hours in practice). 6 of the 19 employees are BOH: Bomb, Chong,
  // Game, Jose, Juan, Papi.
  const bohEmployeesAndPositions: [typeof bomb, typeof headChef][] = [
    [bomb, headChef],
    [chong, pastryChef], // added 2026-08-10 — Pastry Chef corrected to BOH
    [game, sousChef],
    [jose, dishwasher],
    [juan, prep],
    [papi, lineCook],
  ];
  for (const [emp, pos] of bohEmployeesAndPositions) {
    await db.insert(employeeWageRates).values([
      { employeeId: emp.id, positionId: pos.id, period: "Lunch", rate: 100 },
      { employeeId: emp.id, positionId: pos.id, period: "Dinner", rate: 200 },
    ]);
  }

  /* ------------------------------------------------------------------ */
  /* Metrics + Incentive Rules engine (unchanged design, needs to exist  */
  /* before the shift-finalizing loop below, since finalizing reads it)  */
  /* ------------------------------------------------------------------ */

  const [totalSalesMetric, hostDrinkMetric, managerTokenMetric] = await db.insert(metricDefinitions).values([
    { key: "total_sales", label: "Total sales", valueType: "money", scope: "SHIFT", collectionMoment: "close", required: true, enabled: false },
    { key: "host_qualifying_drink_count", label: "Host team drink count (shared, split equally)", valueType: "count", scope: "SHIFT", collectionMoment: "close", required: false, enabled: true },
    { key: "manager_shift_worked", label: "Manager shift worked (token)", valueType: "count", scope: "EMPLOYEE_SHIFT", collectionMoment: "manual", required: false, enabled: true },
  ]).returning();
  void totalSalesMetric;
  void managerTokenMetric;

  await db.insert(positionMetrics).values([
    { positionId: host.id, metricDefinitionId: hostDrinkMetric.id },
  ]);

  const [bohSalesBonusRule] = await db.insert(incentiveRules).values({
    name: "BOH $10k Sales Bonus (test)",
    description:
      "Test rule: every BOH-category employee on the roster gets a flat $20 bonus when the shift's total sales hit $10,000.",
    enabled: true,
    evaluationPeriod: "SHIFT",
    rewardType: "FLAT",
    rewardValue: 20,
    distributionMethod: "PER_TARGET_FLAT",
  }).returning();
  await db.insert(incentiveRuleConditions).values({ ruleId: bohSalesBonusRule.id, metricKey: "total_sales", operator: ">=", value: 10000 });
  await db.insert(incentiveRuleTargets).values({ ruleId: bohSalesBonusRule.id, targetType: "CATEGORY", targetId: "BOH" });

  /* ------------------------------------------------------------------ */
  /* A full 7-day week of fully-staffed, finalized shifts (2026-08-10)   */
  /* — Oliver asked for this directly so My Pay's week/month view has    */
  /* real history to show, and so he stops needing to hand-build a       */
  /* roster every time seed data resets. Every one of the 19 employees   */
  /* is rostered at their PRIMARY position on every shift — a real       */
  /* restaurant obviously wouldn't schedule literally everyone every     */
  /* single day, but this maximizes test coverage per Oliver's explicit  */
  /* ask ("shifts have all position filled") rather than modeling        */
  /* realistic day-to-day scheduling variance. Manager, Operator, and    */
  /* Packer stay unstaffed on every shift, same as Oliver's real data —  */
  /* no employee's PRIMARY position is any of those three, matching the  */
  /* precedent already set by "Delivery Guy (unstaffed today)" in the    */
  /* original seed: it's fine for a position to exist without anyone     */
  /* currently in it.                                                    */
  /*                                                                      */
  /* Dates: Mon 2026-08-03 through Sun 2026-08-09 — the full week just   */
  /* before "today" (2026-08-10 in this session), so it reads naturally  */
  /* as "last week's finalized history." Sales figures vary by day and   */
  /* deliberately cross the $10k incentive threshold on Fri/Sat dinner    */
  /* only, so the BOH bonus visibly fires on some days and not others    */
  /* within the same seeded week — a good live demonstration of the      */
  /* incentive engine without needing to hand-edit numbers to see it.    */
  /* ------------------------------------------------------------------ */

  const allEmployeesWithPrimaryPosition = [
    aey, alesso, bomb, carlos, chong, chui, erika, film, game, gunner,
    jose, juan, kris, meji, nancy, oliver, papi, sammuel, wiinchy,
  ];

  const weekDates = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];
  // [lunchTotalSales, dinnerTotalSales] per day — Fri/Sat dinner cross $10k.
  const dailyTotals: [number, number][] = [
    [3000, 6500], // Mon
    [3200, 7000], // Tue
    [3100, 6800], // Wed
    [3500, 8000], // Thu
    [4200, 11000], // Fri — incentive fires
    [5000, 12500], // Sat — incentive fires
    [4500, 9500], // Sun
  ];

  function round2(n: number): number {
    return Math.round((n + 1e-9) * 100) / 100;
  }

  for (let dayIndex = 0; dayIndex < weekDates.length; dayIndex++) {
    const date = weekDates[dayIndex];
    const [lunchTotal, dinnerTotal] = dailyTotals[dayIndex];

    for (const period of ["Lunch", "Dinner"] as const) {
      const totalSales = period === "Lunch" ? lunchTotal : dinnerTotal;

      const [shift] = await db.insert(shifts).values({ date, period, status: "draft" }).returning();

      await db.insert(shiftRosterEntries).values(
        allEmployeesWithPrimaryPosition.map((emp) => ({
          shiftId: shift.id,
          employeeId: emp.id,
          positionId: emp.primaryPositionId!,
        }))
      );

      const ccTipTotal = round2(totalSales * 0.15);
      const takeoutCcTip = round2(ccTipTotal * 0.07);
      const deliveryToastTip = round2(totalSales * 0.01);
      const cashSales = round2(totalSales * 0.07);
      const cashTip = round2(cashSales * 0.1);
      const pickupCashTip = round2(cashSales * 0.02); // the second jar, at the pickup counter
      const grossFoodSales = round2(totalSales * 0.8);
      const grossBeverageSales = round2(totalSales - grossFoodSales);

      await db.insert(shiftSales).values({
        shiftId: shift.id,
        totalSales,
        ccTipTotal,
        takeoutCcTip,
        deliveryToastTip,
        cashSales,
        cashTip,
        pickupCashTip,
        grossFoodSales,
        grossBeverageSales,
      });

      // Light online-platform activity every shift, split across all 4
      // platforms, mostly platform-courier-delivered (feeds Pool 2 via
      // Host/Operator/Packer/Bag Handler).
      const platformRows = await db.select().from(onlinePlatforms);
      for (const platform of platformRows) {
        const salesAmount = round2(totalSales * 0.03);
        const commissionFee = round2(salesAmount * 0.15);
        // Two tips on every platform record so seeded data exercises both
        // paths: the pickup tip is staff money and funds Pool 2, the courier
        // tip is the platform's own and funds nothing (2026-09-05).
        const tipAmountPlatformPickup = round2(salesAmount * 0.06);
        const tipAmountPlatformCourier = round2(salesAmount * 0.1);
        await db.insert(onlinePlatformSalesRecords).values({
          shiftId: shift.id,
          onlinePlatformId: platform.id,
          salesAmount,
          commissionFee,
          netAmount: round2(salesAmount - commissionFee),
          tipAmountPlatformPickup,
          tipAmountPlatformCourier,
          tipAmountRestaurantDelivery: 0,
        });
      }

      // Host team drink count — Dinner only (a slower, upsell-friendly
      // service), shared/split equally between whoever's on Host (Erika,
      // Meji) that shift, matching the corrected 2026-08-09 business rule.
      if (period === "Dinner") {
        await db.insert(metricValues).values({ shiftId: shift.id, metricDefinitionId: hostDrinkMetric.id, employeeId: null, value: 4 });
      }

      await finalizeShiftWrites(shift.id);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Staff login PINs — TEST-ONLY default (2026-08-10). Every employee   */
  /* gets "1234" purely so a fresh reseed is immediately testable end-   */
  /* to-end. A real restaurant assigns individual PINs per person from   */
  /* Employee admin's "Staff login PIN" section instead.                 */
  /* ------------------------------------------------------------------ */
  const testPinHash = hashPin("1234");
  await db.update(employees).set({ pinHash: testPinHash }).where(eq(employees.active, true));

  console.log(`Seed complete. ${weekDates.length} days x 2 periods = ${weekDates.length * 2} finalized shifts (${weekDates[0]} to ${weekDates[weekDates.length - 1]}), 19 employees, 17 positions.`);
  console.log('Staff login test PIN for every seeded employee: "1234" (e.g. sign in as Erika, Bomb, Papi, ...)');
  console.log("BOH $10k incentive fired on: Fri 2026-08-07 Dinner ($11,000) and Sat 2026-08-08 Dinner ($12,500).");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
