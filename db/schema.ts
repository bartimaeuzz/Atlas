import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* ---------------------------------------------------------------------- */
/* Layer 1 — Master Data                                                   */
/* ---------------------------------------------------------------------- */

export const positions = sqliteTable("positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category", { enum: ["FOH", "BOH"] }).notNull(),
  // Confirmed 2026-08-08: STAFF normally only see roster entries in their own
  // category (FOH sees FOH, BOH sees BOH). Positions flagged true here (e.g.
  // Floor Manager, Manager) are visible to STAFF regardless of category, so
  // everyone can see who's running the shift.
  alwaysVisibleInRoster: integer("always_visible_in_roster", { mode: "boolean" }).notNull().default(false),
  // Corrected 2026-08-08: leadership positions (Floor Manager, Manager) are
  // "หัวหน้า" — their earnings must be hidden from OTHER staff regardless of
  // the FOH/BOH peer-earnings settings below. This is independent of
  // alwaysVisibleInRoster: a position can be schedule-visible but pay-hidden
  // (the common leadership case), and in principle the reverse could exist
  // too, so kept as two separate flags rather than coupled.
  earningsHiddenFromStaff: integer("earnings_hidden_from_staff", { mode: "boolean" }).notNull().default(false),
  // Template value only — not used in calculation, just a suggested starting
  // point shown in the UI when adding a new employee to this position.
  defaultTipPointValue: real("default_tip_point_value"),
  // Retire, don't hard-delete — matches employees.active. A retired
  // position must stay valid for historical shifts that already reference
  // it (roster entries, wage rates, tip pool calcs), it just stops being
  // offered when staffing NEW shifts. Added 2026-08-10 for the Position
  // admin UI (see PROGRESS.md).
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Many-to-many: which tip pool(s) a Position participates in. Replaces an
// earlier single-value tipPoolGroup column on Position (corrected 2026-08-08
// after Oliver found a real bug it caused: Host needed two separate Position
// rows — "Host" for Pool 1 and "Host (Takeout/Online)" for Pool 2 — sharing
// one employee, and a manager could silently forget to add the second
// roster row, which meant that Host lost their Pool 2 tip share with no
// warning. Now "Host" is ONE Position with two rows here (Pool 1 + Pool 2),
// so a single roster entry covers both pools automatically. A Position with
// zero rows here is in no tip pool at all (e.g. Manager, Chef).
// THREE pools exist total:
//   POOL_1_DINE_IN — Server, Runner, Bartender, Host, Busser. Point-weighted.
//   POOL_2_TAKEOUT_ONLINE — Host, Operator, Packer, Bag Handler. Point-weighted.
//     Takeout tip (register) + online-platform tip WHEN THE PLATFORM'S OWN
//     COURIER does the delivery (restaurant staff only packed/handed off).
//   POOL_3_DELIVERY — Delivery Guy. EQUAL split (NOT point-weighted) of
//     Toast-based delivery CC tip (4.5% deducted) + online-platform tip
//     WHEN THE RESTAURANT'S OWN DRIVER does the delivery. Cash tips handed
//     directly to the driver are NOT pooled at all — paid 100% to that
//     individual, tracked separately for reporting only.
// Deliberately kept open-ended (any position can be ticked into any number
// of pools) rather than hard-coding "Server = Pool 1 only" as a business
// rule — this app is meant to be sold to other restaurants that may run
// their floor differently. A future Position admin UI can pre-check sane
// defaults per position without hard-locking them.
export const positionTipPools = sqliteTable(
  "position_tip_pools",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id").notNull().references(() => positions.id),
    tipPoolGroup: text("tip_pool_group", { enum: ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE", "POOL_3_DELIVERY"] }).notNull(),
  },
  (t) => ({
    uniqPositionTipPool: uniqueIndex("uniq_position_tip_pool").on(t.positionId, t.tipPoolGroup),
  })
);

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  hireDate: text("hire_date"), // ISO date string
  primaryPositionId: integer("primary_position_id").references(() => positions.id),
  // Separate from Position (what job they do) — this is what they're allowed
  // to SEE in the system. STAFF gets the restricted roster view; MANAGER/ADMIN
  // see everything. Confirmed 2026-08-08.
  systemRole: text("system_role", { enum: ["STAFF", "MANAGER", "ADMIN"] }).notNull().default("STAFF"),
});

// FOH only — many-to-many: one person can hold several positions, each at
// its own tip-point value (e.g. Server@1.00 and Bartender@0.80 for the same person).
export const employeePositions = sqliteTable(
  "employee_positions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    positionId: integer("position_id").notNull().references(() => positions.id),
    tipPointValue: real("tip_point_value").notNull().default(1.0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    trainedDate: text("trained_date"),
  },
  (t) => ({
    uniqEmployeePosition: uniqueIndex("uniq_employee_position").on(t.employeeId, t.positionId),
  })
);

export const sections = sqliteTable("sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

// Single-row settings table (restaurantId reserved for future multi-tenant use).
export const restaurantSettings = sqliteTable("restaurant_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id").notNull().default(1),
  ccTipDeductionRate: real("cc_tip_deduction_rate").notNull().default(0), // e.g. 0.045 for 4.5%. Default 0 — NOT hardcoded per restaurant.
  // Whether STAFF can see PEERS' money figures (tip share / wage) in the
  // roster view — confirmed 2026-08-08 as restaurant-configurable, but with
  // different defaults: FOH defaults ON (shared/pooled tips, less sensitive),
  // BOH defaults OFF (individually-set wages and bonuses, more sensitive —
  // showing them risks friction since amounts legitimately differ per person).
  // Self always sees their own numbers regardless of these settings.
  rosterShowPeerEarningsFOH: integer("roster_show_peer_earnings_foh", { mode: "boolean" }).notNull().default(true),
  rosterShowPeerEarningsBOH: integer("roster_show_peer_earnings_boh", { mode: "boolean" }).notNull().default(false),
  // Confirmed 2026-08-08: whether each tip pool splits by point value or
  // splits equally is a per-restaurant, per-pool choice — not a fixed rule.
  // Reasoning from Oliver: some restaurants want skill/seniority reflected
  // in pay, others want the pool to reinforce "we're one team" and avoid
  // friction over point judgment calls. Defaults match the behavior this
  // app already had before this setting existed, so nothing changes for
  // Youk Thai unless someone flips it. NOTE: this only covers split METHOD
  // for the three pools that already exist — it does NOT make the pools
  // themselves (count, membership rules, funding formula) configurable.
  // That's a bigger, deliberately deferred change — see the "CONFIRMED
  // ARCHITECTURAL LIMITATION" note in the Track 2 schema memory.
  pool1SplitMethod: text("pool1_split_method", { enum: ["POINT_WEIGHTED", "EQUAL_SPLIT"] }).notNull().default("POINT_WEIGHTED"),
  pool2SplitMethod: text("pool2_split_method", { enum: ["POINT_WEIGHTED", "EQUAL_SPLIT"] }).notNull().default("POINT_WEIGHTED"),
  pool3SplitMethod: text("pool3_split_method", { enum: ["POINT_WEIGHTED", "EQUAL_SPLIT"] }).notNull().default("EQUAL_SPLIT"),
  // $ paid per qualifying drink a host upsells, pulled off the top of Pool 1
  // before the point-weighted split (see calculateTwoPoolTips's hostDrinkBonus
  // param). Restaurant-configurable; default 0 means the bonus is off unless
  // a restaurant sets a rate. Youk Thai seeded to $1.00.
  hostDrinkBonusPerDrinkAmount: real("host_drink_bonus_per_drink_amount").notNull().default(0),
  // Whether STAFF viewers in each category are restricted to seeing ONLY
  // roster entries in their own category (plus alwaysVisibleInRoster
  // positions) — added 2026-08-10 after Oliver pointed out this was
  // hardcoded in lib/roster/visibility.ts with no way to turn it off for a
  // restaurant that wants a fully open roster. Independent per category,
  // same reasoning as the peer-earnings split above (a restaurant might
  // want FOH open but BOH restricted, or vice versa). Both default true,
  // matching the behavior that existed before this setting did, so nothing
  // changes for Youk Thai unless someone flips it. NOTE: this module isn't
  // wired into a live page yet (no staff login/self-serve view exists —
  // see PROGRESS.md's open items), so this setting has no visible effect
  // today; it's here so the design is correct whenever that view ships.
  rosterRestrictFOHToOwnCategory: integer("roster_restrict_foh_to_own_category", { mode: "boolean" }).notNull().default(true),
  rosterRestrictBOHToOwnCategory: integer("roster_restrict_boh_to_own_category", { mode: "boolean" }).notNull().default(true),
});

export const onlinePlatforms = sqliteTable("online_platforms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  restaurantId: integer("restaurant_id").notNull().default(1),
  name: text("name").notNull(), // e.g. Grubhub, UberEats, DoorDash, HungryPanda
});

// FOH flat wage — shared rate per position, varies by meal period.
export const positionShiftRates = sqliteTable(
  "position_shift_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id").notNull().references(() => positions.id),
    period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
    flatRate: real("flat_rate").notNull(),
  },
  (t) => ({
    uniqPositionPeriod: uniqueIndex("uniq_position_period").on(t.positionId, t.period),
  })
);

// BOH individual wage — NOT shared by position, varies per person and per period.
export const employeeWageRates = sqliteTable("employee_wage_rates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
  rate: real("rate").notNull(),
  effectiveFrom: text("effective_from"),
});

/* ---------------------------------------------------------------------- */
/* Layer 1 — Shift & Roster                                                */
/* ---------------------------------------------------------------------- */

// One record per meal period, NOT per calendar day — confirmed necessary
// because staff positions can differ between lunch and dinner on the same date.
export const shifts = sqliteTable(
  "shifts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // ISO date string
    period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
    status: text("status", { enum: ["draft", "finalized"] }).notNull().default("draft"),
    finalizedAt: text("finalized_at"),
  },
  (t) => ({
    uniqDatePeriod: uniqueIndex("uniq_date_period").on(t.date, t.period),
  })
);

export const shiftRosterEntries = sqliteTable("shift_roster_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  sectionId: integer("section_id").references(() => sections.id), // FOH only
  pointValueOverride: real("point_value_override"), // day-only override of EmployeePosition.tipPointValue
  overrideReason: text("override_reason"),
});

// Handles shift-coverage situations (2026-08-10) — e.g. Erika works Host
// but is asked to cover Aey's Bartender shift when Aey calls in sick. Tip
// pool share and the host drink bonus already handle multi-role shifts
// correctly on their own (each roster row contributes its own pool
// membership); WAGE was the one gap, since only ONE role's wage normally
// counts per person per shift. Deliberately per-EMPLOYEE, not per roster
// row — wage is a per-person concept even when someone holds multiple
// roles, so tying this to one specific row would be arbitrary.
// wageOverrideAmount: null = use the normal auto-resolved wage; set = use
// this number instead (for when the auto-pick chose the wrong role).
// extraPayAmount: ALWAYS additive on top of whatever wage applies, shown
// as its own separate line in Preview/Summary — for ad hoc coverage pay
// that shouldn't be folded silently into "their normal wage."
export const shiftWageAdjustments = sqliteTable(
  "shift_wage_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shiftId: integer("shift_id").notNull().references(() => shifts.id),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    wageOverrideAmount: real("wage_override_amount"), // null = auto-resolved
    extraPayAmount: real("extra_pay_amount").notNull().default(0),
    reason: text("reason"), // optional note, e.g. "covered Bartender for Aey (sick)"
  },
  (t) => ({
    uniqShiftEmployee: uniqueIndex("uniq_shift_wage_adjustment").on(t.shiftId, t.employeeId),
  })
);

export const shiftSales = sqliteTable("shift_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id).unique(),
  totalSales: real("total_sales").notNull().default(0),
  ccTipTotal: real("cc_tip_total").notNull().default(0),
  // Manually-identified subset of ccTipTotal from takeout orders paid at the
  // restaurant's own register (same pattern as host-upsell tip identification
  // — Toast doesn't separate this automatically). Feeds Pool 2, NOT Pool 1.
  // ASSUMPTION pending confirmation: the 4.5% deduction applies to this the
  // same as dine-in, since both run through the same card terminal.
  takeoutCcTip: real("takeout_cc_tip").notNull().default(0),
  // Delivery orders placed by phone or the restaurant's own future platform,
  // paid via Toast (not cash, not a third-party platform). Gets the same
  // 4.5% deduction, feeds Pool 3 (Delivery Guy), split equally not by point.
  deliveryToastTip: real("delivery_toast_tip").notNull().default(0),
  cashSales: real("cash_sales").notNull().default(0),
  // Cash tips entered manually by the floor manager at close (2026-08-10,
  // Oliver flagged this was missing entirely). Pooled into Pool 1 exactly
  // like CC tips, but WITHOUT the deduction — there's no card-processing
  // fee on cash, so nothing to deduct. Distinct from cashSales above
  // (total cash revenue, not tips).
  cashTip: real("cash_tip").notNull().default(0),
  grossFoodSales: real("gross_food_sales").notNull().default(0),
  grossBeverageSales: real("gross_beverage_sales").notNull().default(0),
});

export const onlinePlatformSalesRecords = sqliteTable("online_platform_sales_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  onlinePlatformId: integer("online_platform_id").notNull().references(() => onlinePlatforms.id),
  salesAmount: real("sales_amount").notNull().default(0),
  commissionFee: real("commission_fee").notNull().default(0),
  netAmount: real("net_amount").notNull().default(0),
  // Tips collected by the platform itself, passed through to the restaurant.
  // Neither bucket gets the 4.5% CC deduction — confirmed, never touches the
  // restaurant's own card terminal. Split into two buckets because routing
  // depends on WHO delivered the order (confirmed 2026-08-08):
  tipAmountPlatformCourier: real("tip_amount_platform_courier").notNull().default(0), // platform's own courier delivered -> Pool 2
  tipAmountRestaurantDelivery: real("tip_amount_restaurant_delivery").notNull().default(0), // restaurant's own Delivery Guy delivered -> Pool 3
});

/* ---------------------------------------------------------------------- */
/* Layer 1 — Core Tip/Wage Calculation (locked business logic,             */
/* deliberately NOT part of the generic rules engine below)                */
/* ---------------------------------------------------------------------- */

// Dollar figures only — feeds the confirmed CC-tip routing rule
// (net host-upsell tip routes to Host pool instead of general pool).
export const hostUpsellTipRecords = sqliteTable("host_upsell_tip_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id), // the host
  saleAmount: real("sale_amount").notNull().default(0),
  ccTipAmount: real("cc_tip_amount").notNull().default(0),
});

// Calculation snapshot per shift, per confirmed order:
// 1) deduct rate off total ccTip -> netCcTip
// 2) deduct rate off hostUpsellTip -> netHostUpsellTip, routes to Host pool
// 3) netCcTip - netHostUpsellTip = netGeneralCcTip, split by role/section
// 4) within each role, split by point-value proportion
// Cash tips handed directly to a Delivery Guy — NOT pooled, paid 100% to
// that individual. Tracked here for reporting/Earnings Summary purposes only,
// does not feed the tip pool calculation at all.
export const deliveryCashTipRecords = sqliteTable("delivery_cash_tip_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  amount: real("amount").notNull().default(0),
});

export const tipPoolCalculations = sqliteTable("tip_pool_calculations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id).unique(),
  grossCcTip: real("gross_cc_tip").notNull(),
  deductionRate: real("deduction_rate").notNull(),
  netCcTip: real("net_cc_tip").notNull(),
  totalHostUpsellTip: real("total_host_upsell_tip").notNull().default(0),
  netHostUpsellTip: real("net_host_upsell_tip").notNull().default(0),
  netGeneralCcTip: real("net_general_cc_tip").notNull(),
  perRoleBreakdown: text("per_role_breakdown", { mode: "json" }).$type<Record<string, number>>(),
});

// Core wage/tip result per employee per shift. Bonus-engine payouts
// (IncentivePayoutRecord below) are added on top when producing the final
// report, not merged into this table.
export const employeePayouts = sqliteTable("employee_payouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  pointValueUsed: real("point_value_used"),
  tipPoolShare: real("tip_pool_share").notNull().default(0),
  // Per-pool breakdown of tipPoolShare (2026-08-10, Oliver wanted this
  // visible as separate columns rather than one combined figure) — sum of
  // these three always equals tipPoolShare above.
  pool1Share: real("pool1_share").notNull().default(0),
  pool2Share: real("pool2_share").notNull().default(0),
  pool3Share: real("pool3_share").notNull().default(0),
  // "Regular" wage — either the auto-resolved rate, or the manual override
  // if one was entered (see shiftWageAdjustments). Deliberately still
  // called flatWageAmount, not split into "auto" vs "override" columns —
  // once finalized, a manager doesn't need to know it was overridden, just
  // what the final number was. extraPayAmount below is the separate,
  // always-visible additive line.
  flatWageAmount: real("flat_wage_amount").notNull().default(0),
  hostUpsellTipShare: real("host_upsell_tip_share"),
  extraPayAmount: real("extra_pay_amount").notNull().default(0),
  // tipPoolShare + hostUpsellTipShare — every dollar that's a TIP, distinct
  // from wage/extra pay. Added 2026-08-10.
  totalTip: real("total_tip").notNull().default(0),
  // Sum of every fired IncentiveRule payout for this employee this shift
  // (2026-08-10 — first real use of the incentiveRules/incentiveRuleConditions/
  // incentiveRuleTargets tables below, see lib/calc/incentiveRules.ts).
  // Rule-level detail (which rule, what amount) is written separately to
  // incentivePayoutRecords for audit purposes; this column is just the
  // per-shift total, shown as its own column like extraPayAmount.
  incentiveAmount: real("incentive_amount").notNull().default(0),
  totalCorePayout: real("total_core_payout").notNull().default(0),
});

/* ---------------------------------------------------------------------- */
/* Layer 2 — Generic Metrics + Incentive Rules Engine                      */
/* Restaurant-configurable bonuses. No schema change needed to add a       */
/* new bonus type — see mapping examples in the schema doc.                */
/* ---------------------------------------------------------------------- */

export const metricDefinitions = sqliteTable("metric_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  valueType: text("value_type", { enum: ["money", "number", "count"] }).notNull(),
  // SHIFT = one value per shift (e.g. total_sales)
  // EMPLOYEE_SHIFT = one value per employee per shift (e.g. host_qualifying_drink_count)
  scope: text("scope", { enum: ["SHIFT", "EMPLOYEE_SHIFT"] }).notNull(),
  collectionMoment: text("collection_moment", { enum: ["open", "close", "both", "manual"] }).notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

// Which positions are eligible to have a given EMPLOYEE_SHIFT metric
// collected on the closing report (e.g. Host <-> host_qualifying_drink_count).
// Generic on purpose: adding a new per-employee bonus metric later just means
// seeding new rows here, not new UI code -- the closing report loops over
// whatever's eligible. Replaces the old positionName.startsWith("Host") hack
// that lived in the playground calculator before this table existed.
export const positionMetrics = sqliteTable(
  "position_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id").notNull().references(() => positions.id),
    metricDefinitionId: integer("metric_definition_id").notNull().references(() => metricDefinitions.id),
  },
  (t) => ({
    uniqPositionMetric: uniqueIndex("uniq_position_metric").on(t.positionId, t.metricDefinitionId),
  })
);

export const metricValues = sqliteTable("metric_values", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metricDefinitionId: integer("metric_definition_id").notNull().references(() => metricDefinitions.id),
  shiftId: integer("shift_id").notNull().references(() => shifts.id),
  employeeId: integer("employee_id").references(() => employees.id), // null when scope=SHIFT
  value: real("value").notNull(),
});

export const incentiveRules = sqliteTable("incentive_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  evaluationPeriod: text("evaluation_period", { enum: ["SHIFT", "WEEK", "MONTH"] }).notNull(),
  rewardType: text("reward_type", { enum: ["FLAT", "PERCENT_OF_METRIC", "ADJUST_TIP_POINT"] }).notNull(),
  rewardValue: real("reward_value").notNull(),
  rewardCap: real("reward_cap"), // e.g. host bonus capped at +0.2 points
  distributionMethod: text("distribution_method", { enum: ["PER_TARGET_FLAT", "WEIGHTED_POOL"] }).notNull(),
  weightSource: text("weight_source", { enum: ["MANUAL", "METRIC_SUM"] }),
  weightMetricKey: text("weight_metric_key"), // used when weightSource = METRIC_SUM
  poolSourceMetricKey: text("pool_source_metric_key"), // which metric funds the pool when rewardType = PERCENT_OF_METRIC
});

export const incentiveRuleConditions = sqliteTable("incentive_rule_conditions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull().references(() => incentiveRules.id),
  metricKey: text("metric_key").notNull(),
  operator: text("operator", { enum: [">=", ">", "<=", "<", "between"] }).notNull(),
  value: real("value").notNull(),
  valueTo: real("value_to"), // used when operator = between
});

export const incentiveRuleTargets = sqliteTable("incentive_rule_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull().references(() => incentiveRules.id),
  targetType: text("target_type", { enum: ["POSITION", "EMPLOYEE", "CATEGORY"] }).notNull(),
  targetId: text("target_id").notNull(), // positionId, employeeId, or "FOH"/"BOH" as text
});

// Manual per-employee weighting, default 1.00 if unset —
// same override pattern as EmployeePosition.tipPointValue.
export const employeeRuleWeights = sqliteTable(
  "employee_rule_weights",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ruleId: integer("rule_id").notNull().references(() => incentiveRules.id),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    weight: real("weight").notNull().default(1.0),
    effectiveFrom: text("effective_from"),
  },
  (t) => ({
    uniqRuleEmployee: uniqueIndex("uniq_rule_employee").on(t.ruleId, t.employeeId),
  })
);

// Computed output, audit trail — feeds the future Earnings Summary feature.
export const incentivePayoutRecords = sqliteTable("incentive_payout_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull().references(() => incentiveRules.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  periodType: text("period_type", { enum: ["SHIFT", "WEEK", "MONTH"] }).notNull(),
  periodKey: text("period_key").notNull(), // shiftId as string, or ISO week/month string
  computedAmount: real("computed_amount").notNull(),
  metricSnapshot: text("metric_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});
