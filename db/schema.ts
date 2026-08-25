import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
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
  // Whether working THIS position grants elevated (manager-tier) roster
  // visibility for that shift (2026-08-10) — see lib/staff/loadMyEarnings.ts.
  // Deliberately SHIFT-scoped, not a standing per-employee flag: Oliver
  // caught a real modeling bug where an employee's fixed employees.systemRole
  // had drifted out of sync with who was actually working as Floor Manager
  // that day (Aey flagged MANAGER despite rarely working that position;
  // Nancy — whose PRIMARY position literally IS Floor Manager — left at
  // the default STAFF). Tying elevated visibility to the position worked
  // THAT SHIFT instead of a hand-maintained employee flag makes this
  // self-correcting: whoever is actually covering Floor Manager or Manager
  // on a given shift gets full visibility for that shift, no matter who
  // they normally are. employees.systemRole still exists for a genuinely
  // standing elevation (ADMIN — system ownership, not a floor role).
  grantsManagerAccess: integer("grants_manager_access", { mode: "boolean" }).notNull().default(false),
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
  // Renamed from `name` (2026-08-17) -- this was always the informal name
  // shown everywhere in the app (schedule, roster, nav, tip pools: "Aey",
  // "Bomb", "Papi"), never a legal name. Renaming makes that explicit now
  // that a real legalFirstName/legalLastName exists below for payroll.
  // Every OTHER loader in the app still aliases this back to `name` in
  // its own return shape (`.select({ name: employees.nickname })`) --
  // deliberately, since "nickname" is genuinely what those screens want
  // to show, not a UI wording change.
  nickname: text("nickname").notNull(),
  // Legal name for payroll/tax documents (2026-08-17, Oliver: "I need a
  // real name and last name for their payroll"). Nullable, NOT backfilled
  // with a placeholder for existing seeded employees -- an empty legal
  // name honestly means "not collected yet," not a fake value. Enforced
  // as required at the form level for newly-created employees only.
  legalFirstName: text("legal_first_name"),
  legalLastName: text("legal_last_name"),
  // Personal info (2026-08-17, Oliver: "employee section also need their
  // staff personal information... mobile phone number, DOB, address,
  // SSN or ITIN"). All nullable (not backfilled), and all gated to
  // Admin-only at the application layer for now (see
  // requireAdminAction in lib/actions/employees.ts) until the confirmed-
  // but-not-yet-built Permission System's Financial Auditor tier exists
  // (see project_atlas_permission_system memory) -- that's the real long-
  // term home for this access control, this is a stopgap.
  //
  // ssnOrItin is stored as plain text, same trust model as the rest of
  // this app's data (no field-level encryption at rest exists in this
  // codebase yet) -- protected by the Admin-only application check, NOT
  // by encryption. Worth real encryption-at-rest before this app handles
  // a live restaurant's actual employee SSNs; flagged honestly rather
  // than implied to be more secure than it is. Masked to last 4 digits
  // in every read-only display; only the edit form (Admin-only) ever
  // shows the full value.
  //
  // NOTE (2026-08-17, told to Oliver, not independently verified): SSN
  // is generally for W-2 employees; ITIN is generally for people who
  // file taxes but are NOT authorized as W-2 employees (contractors,
  // dependents, etc.) -- collecting either one and treating them as
  // interchangeable for payroll may not be correct. Verify with an
  // accountant/payroll provider before relying on this field for actual
  // filing; this app does not attempt to validate or distinguish the two.
  dateOfBirth: text("date_of_birth"), // ISO date string
  mobilePhone: text("mobile_phone"),
  // Email (2026-08-19) — added as a prerequisite for the confirmed-but-
  // not-yet-built Permission System's "Contact-info tier" (mobile phone,
  // email, DOB — open to Floor Manager and above once the capability
  // system exists; see project_atlas_permission_system memory). Same
  // stopgap access model as the rest of this personal-info block for now:
  // nullable, not backfilled, gated Admin-only at the application layer
  // (requireManagerAction + isAdminSession in lib/actions/employees.ts)
  // until that capability tier is actually built. No uniqueness
  // constraint and no format validation deliberately -- this is a plain
  // contact field, not a login credential (that's loginId, a separate
  // system per project_atlas_people_login_id memory).
  email: text("email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  ssnOrItin: text("ssn_or_itin"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  hireDate: text("hire_date"), // ISO date string
  primaryPositionId: integer("primary_position_id").references(() => positions.id),
  // Separate from Position (what job they do) — this is what they're allowed
  // to SEE in the system. STAFF gets the restricted roster view; MANAGER/ADMIN
  // see everything. Confirmed 2026-08-08.
  systemRole: text("system_role", { enum: ["STAFF", "MANAGER", "ADMIN"] }).notNull().default("STAFF"),
  // Staff self-service login (2026-08-10) — a simple PIN, not an
  // email/password, matching how a shared restaurant terminal actually
  // gets used (one device, whoever's on shift punches in). Stored as
  // "salt:hash" hex via Node's built-in scrypt (lib/auth/pin.ts) — no new
  // dependency needed for a v1 internal tool. Null = no PIN set yet, can't
  // log in (see setEmployeePin in lib/actions/employees.ts for how an
  // admin assigns/resets one from the Employee admin page).
  pinHash: text("pin_hash"),
  // Financial auditor flag (2026-08-15) — Oliver, after catching a
  // Supplier Check editing gap: "in real senario it is admin and Aey ...
  // as Aey will be a financial audit for Youk."
  //
  // NARROWED 2026-08-23 to ONE meaning: whose sign-off counts. Their
  // EXISTING staff-login PIN (pinHash above) is the confirmation code
  // required on every edit of an already Printed/Paid supplier check,
  // "like manager code in bank" — even an Admin editing has to enter a
  // flagged auditor's code, not their own, so it works as a real
  // two-person sign-off rather than a role check.
  //
  // It no longer decides WHO MAY ATTEMPT that edit. That half moved onto
  // FA_SUPPLIER_CHECK_EDIT_LOCKED in the capability registry, where
  // /permissions can show it honestly — this column was enforcing access
  // that the registry claimed to govern and did not, and two sources of
  // truth for one rule drift apart. Do NOT point the PIN lookup at the
  // capability to "finish the job": every Admin holds it, so an Admin
  // would become a valid signer for their own edit and the control would
  // quietly stop being two-person. Permission and identity are different
  // questions here; only the first one belongs in the registry.
  //
  // Independent of systemRole on purpose — Aey is seeded as MANAGER, not
  // ADMIN, but is the person whose sign-off Youk Thai actually relies on.
  isFinancialAuditor: integer("is_financial_auditor", { mode: "boolean" }).notNull().default(false),
  // Partner flag (2026-08-17, Oliver: "add PARTNER") — independent of
  // systemRole (which is about what they can SEE/do in the app, e.g. an
  // ADMIN account might not be a restaurant partner, and a partner might
  // be seeded as MANAGER, same reasoning as isFinancialAuditor above).
  // Used as the default department when generating this person's login
  // ID below (see lib/employees/loginId.ts) — a partner defaults to
  // department digit 0, everyone else defaults to their position's
  // FOH/BOH category. Editable per-employee on the People page.
  isPartner: integer("is_partner", { mode: "boolean" }).notNull().default(false),
  // Which Account Type preset was last applied to this account
  // (2026-08-23, Oliver: "เก็บจริง — เพิ่มคอลัมน์"). Written by
  // applyAccountTypePreset in lib/actions/permissions.ts, and read by
  // /permissions to show how far an account's individual capabilities
  // have drifted from the preset it started on.
  //
  // NULLABLE and deliberately NOT backfilled: null means "no preset has
  // been applied to this account", which is the honest state for every
  // row that predates this column. Guessing a value from systemRole
  // would make the drift summary compare against a baseline nobody
  // actually chose -- the whole point of storing it is that the baseline
  // stops being a guess.
  //
  // A LOG, not a binding: applying a preset overwrites capability rows
  // and stamps this; editing an individual capability afterwards does
  // NOT clear it. That is what makes "differs from preset" meaningful.
  accountType: text("account_type", {
    enum: ["STAFF", "ASSISTANT_MANAGER", "FLOOR_MANAGER", "PARTNER", "ADMIN"],
  }),
  // Login ID (2026-08-17, Oliver: "build ID and login... format YK with 2
  // digit yr 2 digit month 1 digit department 0=admin 1=partner 2=BOH
  // 3=FOH and 3 digit running number" — refined in conversation to: no
  // digit for admin (that's a login PERMISSION via systemRole, not a
  // department), so the department digit actually generated is
  // 0=Partner / 1=BOH / 2=FOH. Format: "YK" + hire-year(2) +
  // hire-month(2) + department(1) + running number(3), e.g.
  // "YK2608 1007" -> YK260810 07 for a BOH hire in Aug 2026, 7th ID ever
  // generated (see lib/employees/loginId.ts for the exact builder).
  // Nullable — not every employee has one generated yet. Generated
  // on-demand from the People page (a manager picks the department in a
  // dialog, pre-filled with a best guess from isPartner/position
  // category) or in bulk via the one-time backfill script
  // (db/backfillLoginIds.ts). Globally unique, one shared running-number
  // sequence across all three departments (loginSequence below), per
  // Oliver: "one shared global counter (never resets)."
  loginId: text("login_id").unique(),
  // The running-number sequence value used to generate loginId above —
  // stored (not re-derived) so the "next" number is always
  // MAX(loginSequence)+1 regardless of how many employees still have no
  // ID yet. Kept as its own column instead of parsing it back out of
  // loginId's string so the generator never has to trust its own past
  // string formatting.
  loginSequence: integer("login_sequence"),
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

// Staff self-service login sessions (2026-08-10) — deliberately simple
// server-side session store (a random token in an httpOnly cookie, looked
// up here) rather than a JWT, since we already have SQLite sitting right
// there and don't need a stateless session for this scale. expiresAt is
// checked on every lookup (see lib/auth/session.ts); logging out just
// deletes the row, which also means an admin could revoke a session by
// deleting rows here directly if that's ever needed (no UI for that yet —
// not asked for). Scope note: this protects the NEW staff-facing pages
// (/login, /me) only — the existing manager-facing pages (/shifts,
// /employees, /positions, /settings) remain open/unauthenticated, same as
// before this round. Gating the whole manager app behind login is a
// separate, bigger decision, deliberately not made here.
export const staffSessions = sqliteTable("staff_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  expiresAt: text("expires_at").notNull(),
  // 30-minute inactivity auto-logout (confirmed 2026-08-18, see
  // project memory "Atlas Session Security"): updated on real activity
  // (page loads / server actions), throttled — see
  // lib/auth/idleTimeout.ts. Checked alongside expiresAt in
  // resolveSessionToken; a session is only valid within BOTH the 30-min
  // idle window and the 14h hard cap, whichever is stricter.
  lastActivityAt: text("last_activity_at").notNull().default(sql`(current_timestamp)`),
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
  //
  // Split 2026-08-10 (Oliver, per-column visibility backlog item — see
  // PROGRESS.md): this used to be ONE combined toggle per category that
  // hid/showed tip share AND wage together. Confirmed scope: keep the same
  // FOH/BOH category-level granularity (not per-employee), just separate
  // Tip from Wage so a restaurant can show one without the other (e.g. tip
  // share is pooled/shared and fine to show, but wage is individually
  // negotiated and more sensitive — or vice versa). rosterShowPeerTipFOH/BOH
  // REPURPOSES the original "earnings" column below — same SQL column
  // (`roster_show_peer_earnings_foh`/`boh`), just narrowed in meaning to
  // "tip" now that wage has its own column, so no migration was needed for
  // this half of the split. rosterShowPeerWageFOH/BOH are brand-new columns,
  // defaulted to the SAME true/false split the combined toggle already had —
  // preserves today's behavior exactly for Youk Thai until someone flips
  // Tip and Wage independently in Settings.
  rosterShowPeerTipFOH: integer("roster_show_peer_earnings_foh", { mode: "boolean" }).notNull().default(true),
  rosterShowPeerTipBOH: integer("roster_show_peer_earnings_boh", { mode: "boolean" }).notNull().default(false),
  rosterShowPeerWageFOH: integer("roster_show_peer_wage_foh", { mode: "boolean" }).notNull().default(true),
  rosterShowPeerWageBOH: integer("roster_show_peer_wage_boh", { mode: "boolean" }).notNull().default(false),
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
  // Added 2026-08-10 at Oliver's request: whether a STAFF viewer sees the
  // "Also worked this shift" coworker list on My Pay AT ALL, keyed by the
  // VIEWER's own category (same convention as rosterRestrict*ToOwnCategory
  // above). This is a separate, earlier gate than rosterShowPeerEarnings* —
  // that pair only controls whether the $ FIGURES on a peer's row are
  // shown; this pair controls whether the peer's row (name + position)
  // shows up in the list at all. When off, getVisibleRosterEntries drops
  // every entry except the viewer's own, so the whole section disappears
  // from My Pay (MyEarningsView only renders it when coworkers.length > 1).
  // Defaults true for both — matches the behavior that existed before this
  // setting did, so nothing changes for Youk Thai unless someone flips it
  // in Settings. Oliver's own stated reasoning for wanting this control:
  // staff logging in to check their own pay may not need to see coworkers'
  // money OR names at all, as a privacy safeguard.
  rosterShowCoworkerListFOH: integer("roster_show_coworker_list_foh", { mode: "boolean" }).notNull().default(true),
  rosterShowCoworkerListBOH: integer("roster_show_coworker_list_boh", { mode: "boolean" }).notNull().default(true),
  // Sales tax export feature (2026-08-10) — reviewed against Oliver's real
  // "MARCH 2026.xlsx" monthly report (Toast + 4 online platforms, each with
  // its own Net/Tax/Total). Confirmed with Oliver: shiftSales.totalSales has
  // ALWAYS meant Net Sale (pre-tax) — this rate is just a starting default,
  // NOT the source of truth. Stored as a fraction (0.08875 for NYC's
  // combined 8.875%) — the Settings UI takes/shows a percent and converts
  // (see lib/actions/settings.ts). Column default stays 0 deliberately
  // (2026-08-15) — every real restaurant row is seeded with the actual
  // 0.08875 NYC rate already (db/seed.ts), and this column default only
  // matters for the "row somehow doesn't exist" fallback in
  // loadRestaurantSettings.ts, which now returns 0.08875 there instead.
  // Kept this way to avoid a schema migration for a column default that
  // isn't hit in practice.
  defaultSalesTaxRate: real("default_sales_tax_rate").notNull().default(0),
  // Staff login method (2026-08-17, Oliver: "here is test seed anyway I
  // need easy way to login on each profile" -- wants BOTH the original
  // pick-your-name dropdown AND the new YK login-ID field available,
  // switchable per restaurant rather than picking one permanently).
  // "NAME" = original pick-from-list + PIN (default, unchanged
  // behavior). "ID" = type your YK login ID + PIN. See app/login/page.tsx.
  staffLoginMethod: text("staff_login_method", { enum: ["NAME", "ID"] }).notNull().default("NAME"),
  // Account recovery code (2026-08-17, Oliver: "What should we do when the
  // admin forgot his password?" -- clarified this needs to work for a
  // customer restaurant with zero access back to Claude/Oliver, not just
  // a script only Oliver can run). A restaurant-level "master key" --
  // NOT tied to any one employee -- an Admin generates it from Settings,
  // it's shown in plaintext exactly once at generation time (never stored
  // that way), and it's the one thing that can reset ANY employee's PIN
  // from the public /login/recover page without an existing session.
  // Same hash format as employees.pinHash (lib/auth/pin.ts's generic
  // scrypt hashPin/verifyPin -- not PIN-specific despite the name).
  // Nullable -- a restaurant that never generates one simply has no
  // self-service recovery path yet (same as today, before this feature).
  recoveryCodeHash: text("recovery_code_hash"),
  recoveryCodeSetAt: text("recovery_code_set_at"), // ISO timestamp, for Settings' "generated on ..." display
  // Brute-force protection (2026-08-17, confirmed with Oliver: lock out
  // after 5 wrong tries for 15 minutes) -- this code can reset every PIN
  // in the restaurant, so guessing it is much higher-value than guessing
  // one employee's PIN. Both reset to 0/null on ANY correct redemption;
  // recoveryFailedAttempts resets to 0 (not just decremented) once a
  // lockout is triggered, so the 15-minute window is the only thing
  // standing between a locked-out attacker and a fresh set of 5 tries --
  // deliberate, matches how simple lockout schemes normally work.
  recoveryFailedAttempts: integer("recovery_failed_attempts").notNull().default(0),
  recoveryLockedUntil: text("recovery_locked_until"), // ISO timestamp; null/past = not locked
  // Visibility into whether/when the master key has actually been used
  // (2026-08-17) -- surfaced on Settings so an Admin notices if it was
  // redeemed without their knowledge. Deliberately NOT a full audit log
  // table (single most-recent redemption only) -- a fuller log is easy to
  // add later if actually wanted; this is the minimum that makes misuse
  // visible without building an audit-log viewer nobody's asked for yet.
  recoveryCodeLastUsedAt: text("recovery_code_last_used_at"),
  recoveryCodeLastUsedForEmployeeId: integer("recovery_code_last_used_for_employee_id").references(() => employees.id),
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
// deductionAmount / deductionReason: added 2026-08-10 for disciplinary/
// correction deductions (late, property damage, etc.) — confirmed with
// Oliver: fits this same row rather than a new table, since it's the same
// "Floor Manager enters a dollar adjustment before finalizing" timing and
// trust level as the override/extra-pay fields above. ALWAYS subtractive
// from totalCorePayout, its own separate line (never netted silently into
// flatWageAmount) — see finalizeShift.ts. Visibility (confirmed with
// Oliver): shown to the employee themselves + managers only (Preview/
// Summary, which is manager-facing), NEVER to coworkers on My Pay's
// "Also worked this shift" list — same precedent as extraPayAmount, which
// already isn't exposed there either. Takes effect immediately on save,
// same as override/extra pay — no separate approval step (confirmed).
export const shiftWageAdjustments = sqliteTable(
  "shift_wage_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shiftId: integer("shift_id").notNull().references(() => shifts.id),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    wageOverrideAmount: real("wage_override_amount"), // null = auto-resolved
    extraPayAmount: real("extra_pay_amount").notNull().default(0),
    reason: text("reason"), // optional note, e.g. "covered Bartender for Aey (sick)"
    deductionAmount: real("deduction_amount").notNull().default(0),
    deductionReason: text("deduction_reason"), // e.g. "late 45 min", "broke a plate rack"
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
  // CONFIRMED 2026-08-23 (Oliver): the CC deduction applies to this at the
  // same rate as dine-in, since both run through the same card terminal.
  // This carried an "ASSUMPTION pending confirmation" note from 2026-08-10
  // until then; the behaviour never changed, only its status. The rule is
  // enforced at lib/calc/tipPool.ts's Pool 2 section and locked by the
  // "Pool 2: takeout tip gets the deduction, online-platform tips do not"
  // test in lib/calc/__tests__/tipPool.test.ts.
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
  // Sales tax collected on totalSales (2026-08-10) — reporting-only, never
  // touches tip/wage math. NULLABLE, same "null = auto-resolve" convention
  // as shiftWageAdjustments.wageOverrideAmount: null means nobody has
  // touched this yet, so the loader/export computes a SUGGESTED value from
  // restaurantSettings.defaultSalesTaxRate × totalSales; a manager typing an
  // explicit number (including 0) always wins over the suggestion. Chose
  // nullable over notNull-default-0 specifically so a legitimate $0 entry
  // doesn't get silently re-overwritten by the auto-suggestion on next
  // load. Reviewed against Oliver's real "MARCH 2026.xlsx" export — see
  // PROGRESS.md's dated section for the full Cash/CC/Total Credit
  // column-swap finding from that same review.
  salesTax: real("sales_tax"),
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
  // Sales tax for this platform's orders (2026-08-10) — same auto-fill-then-
  // override pattern as shiftSales.salesTax above, computed off salesAmount.
  // Each online platform in Oliver's real report has its own Tax column
  // (Grubhub/Uber/Doordash/Hungry Panda all differ), so this lives per
  // record, not as one shared shift-level number. NULLABLE — same
  // null-means-auto-suggest convention as shiftSales.salesTax above.
  taxAmount: real("tax_amount"),
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
  // Snapshot of shiftWageAdjustments.deductionAmount at finalize time
  // (2026-08-10) — same pattern as extraPayAmount above: always subtracted
  // in totalCorePayout, shown as its own separate line, never silently
  // folded into flatWageAmount. 0 if no deduction was entered.
  deductionAmount: real("deduction_amount").notNull().default(0),
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

/* ---------------------------------------------------------------------- */
/* Layer 3 — Schedule Planner (Phase 1, 2026-08-11)                        */
/* Confirmed against a real reference schedule (Soothr LIC) + several      */
/* rounds of design discussion with Oliver — see the                       */
/* Atlas_Schedule_Planner_Schema_v1.md doc and the                         */
/* project-atlas-schedule-planner memory file for the full reasoning.      */
/* Phase 1 only: headcount targets + recurring template assignments.       */
/* The weekly plan, auto-seed-into-Shift, leave requests, and swap         */
/* requests are later phases, deliberately not built yet.                  */
/* ---------------------------------------------------------------------- */

// "How many of this Position do we need, on this day-of-week, this
// period?" Confirmed with Oliver: the numbered rows on real restaurant
// schedules (Runner 1/2/3/4, Bar 1/2/3, Host 1/2/3, etc.) are exactly
// this — a headcount number for that position, NOT distinct job titles.
// This is what lets a manager glance at a day and see an under-target
// position at a glance once the weekly plan (a later phase) exists.
// dayOfWeek: 0=Sunday..6=Saturday, matching JS Date.getDay() convention
// used elsewhere in this app (see app/reports/page.tsx's date helpers).
export const positionStaffingTargets = sqliteTable(
  "position_staffing_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    positionId: integer("position_id").notNull().references(() => positions.id),
    dayOfWeek: integer("day_of_week").notNull(), // 0-6, Sun-Sat
    period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
    targetCount: integer("target_count").notNull().default(0),
  },
  (t) => ({
    uniqPositionDayPeriod: uniqueIndex("uniq_staffing_target_position_day_period").on(
      t.positionId,
      t.dayOfWeek,
      t.period
    ),
  })
);

// "Employee X normally works Position Y, this day-of-week, this period."
// The recurring baseline a weekly plan (later phase) gets pre-filled
// from. Confirmed with Oliver: the schedule is a deliberately fixed
// baseline — this table only changes when someone tells the Manager to
// change it (a resignation, a promotion, a sales-driven staffing need),
// not on an automatic weekly rebuild.
//
// vacancyReason/vacancyStartsOn: what drives the RED highlight on
// Soothr's reference sheet. Corrected understanding after a first wrong
// guess (see memory) — NOT about open swap requests. It's set when an
// employee has given resignation notice (two weeks is the Thai
// restaurant custom) or been promoted/transferred to a different
// position, i.e. this slot is KNOWN to be permanently vacating. Doubles
// as (a) an internal "open shift, come talk to me" signal for other
// staff and (b) the Manager's own hiring/coverage tracker. Deliberately
// does NOT cover approved LEAVE — a temporary absence doesn't change the
// permanent recurring pattern, so that's handled by a separate
// leaveRequests table in a later phase instead, cross-referenced at
// weekly-plan-build time rather than mutating this row.
//
// active: retire, don't hard-delete — same convention as
// positions.active/employeePositions.isActive. Once a permanent
// replacement is settled for a vacated slot, the old template row gets
// retired (active=false) and a new one created for the replacement,
// rather than overwriting employeeId in place — keeps a clean history
// of who has held this slot over time.
//
// Vacancy CASCADE SCOPE (2026-08-11, clarified with Oliver): "Mark
// vacating" on the UI operates on one row you click, but the ACTION
// (lib/actions/schedule.ts's setTemplateVacancy/clearTemplateVacancy)
// applies it more broadly depending on the reason, matching what each
// reason means in real life — a resignation isn't scoped to one shift.
// RESIGNATION cascades to every active row for that employeeId;
// PROMOTION cascades to every active row for that employeeId+
// positionId; OTHER stays scoped to the single row (the "employee
// asked to permanently drop this one recurring day" case).
export const employeeScheduleTemplates = sqliteTable(
  "employee_schedule_templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    positionId: integer("position_id").notNull().references(() => positions.id),
    dayOfWeek: integer("day_of_week").notNull(), // 0-6, Sun-Sat
    period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
    effectiveFrom: text("effective_from"), // ISO date string, same convention as employeeWageRates.effectiveFrom
    vacancyReason: text("vacancy_reason", { enum: ["RESIGNATION", "PROMOTION", "OTHER"] }),
    vacancyStartsOn: text("vacancy_starts_on"), // ISO date string, set together with vacancyReason
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({
    uniqEmployeePositionDayPeriod: uniqueIndex("uniq_template_employee_position_day_period").on(
      t.employeeId,
      t.positionId,
      t.dayOfWeek,
      t.period
    ),
  })
);

// Phase 2 (2026-08-11) — a specific week's actual planned schedule.
// weekStartDate is always a Monday (see lib/schedule/weekMath.ts), same
// week-boundary convention already used by Reports and My Pay's
// week/month grouping. Kept deliberately separate from shifts/
// shiftRosterEntries (the day-of operational tables the Closing Report
// uses) — planning ahead and day-of operations are different concerns.
// Once published, createShift (lib/actions/shift.ts) auto-seeds a real
// Shift's roster from the matching plannedShiftAssignments rows for that
// date — see that function's comment for how the hook works.
export const scheduleWeeks = sqliteTable("schedule_weeks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekStartDate: text("week_start_date").notNull().unique(),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  publishedAt: text("published_at"),
});

// One row per (employee, position, date, period) slot in a specific
// week's plan. Usually generated from employeeScheduleTemplates
// (sourceType=FROM_TEMPLATE) when the week is first built, but a manager
// can add/remove rows to handle that week's exceptions — sourceType
// distinguishes FROM_TEMPLATE / MANUAL_ADD / AUTO_FILL (2026-08-15, the
// Weekly Plan "Auto-fill" button — lib/actions/schedule.ts's
// autoFillWeek) so it's clear at a glance which mechanism placed a given
// assignment. A plain TEXT column, no CHECK constraint, so widening the
// enum needed no migration (same as supplier_invoices.status earlier).
// isExtraCoverage is the YELLOW flag from the reference schedule —
// confirmed standalone with Oliver, NOT tied to a red vacancy: a manager
// marking a day as needing extra headcount beyond the template (an
// anticipated busy day, a known advance-booked event), independent of
// anyone actually leaving.
// Append-only record of schedule edits that removed something a staff
// member could have already seen: clear a day / delete a whole week
// (the bulk "danger zone" actions), plus a single person being pulled
// off one slot via the ordinary grid remove button when that week is
// already PUBLISHED (added after Oliver noticed Nancy never got a log
// entry when he removed her from a published Tuesday -- the ordinary
// remove button pre-dates this whole logging system and wasn't wired
// into it until then). Draft-week edits of any kind are never logged
// here -- nobody outside management has seen a draft.
//
// 2026-08-14, Oliver's follow-up after the danger zone itself: dropped
// the PIN re-check (his words: "pin might not be the answer" for a
// small restaurant where one manager does everything),
// replaced with a typed confirmation word instead (see lib/actions/
// schedule.ts), plus this log so staff "at least know what is happening
// with their shift" -- and a required reason specifically when the
// thing being removed was already PUBLISHED (draft removals don't
// need one, nobody outside management has seen a draft yet).
//
// Deliberately NOT a foreign key on weekId -> scheduleWeeks.id: a
// DELETED_WEEK entry is logged in the same breath as the week row
// itself being deleted, so a hard FK would either cascade-delete this
// row too (defeats the point of an audit log) or fail the delete
// outright. weekStartDate is stored directly instead so the log reads
// correctly forever, even after the week it refers to is gone.
export const scheduleChangeLog = sqliteTable("schedule_change_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekId: integer("week_id").notNull(),
  weekStartDate: text("week_start_date").notNull(),
  action: text("action", { enum: ["CLEARED_DAY", "DELETED_WEEK", "REMOVED_ASSIGNMENT"] }).notNull(),
  date: text("date"), // the one date cleared; null for a whole-week delete
  wasPublished: integer("was_published", { mode: "boolean" }).notNull(),
  reason: text("reason"), // required by the action itself when wasPublished=true; optional for drafts
  performedByEmployeeId: integer("performed_by_employee_id").notNull().references(() => employees.id),
  performedByName: text("performed_by_name").notNull(), // denormalized so the log still reads right if the employee's name later changes
  // JSON array of { employeeId, employeeName, positionId, positionName, date, period } --
  // the actual assignments that were removed, so the log (and the
  // staff-facing view built from it) doesn't need to reconstruct
  // anything from data that no longer exists.
  removedAssignments: text("removed_assignments").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const plannedShiftAssignments = sqliteTable(
  "planned_shift_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekId: integer("week_id").notNull().references(() => scheduleWeeks.id),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    positionId: integer("position_id").notNull().references(() => positions.id),
    date: text("date").notNull(), // ISO date string, a specific day within that week
    period: text("period", { enum: ["Lunch", "Dinner"] }).notNull(),
    sourceType: text("source_type", { enum: ["FROM_TEMPLATE", "MANUAL_ADD", "AUTO_FILL"] }).notNull().default("MANUAL_ADD"),
    isExtraCoverage: integer("is_extra_coverage", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    uniqWeekEmployeePositionDatePeriod: uniqueIndex("uniq_planned_assignment_week_employee_position_date_period").on(
      t.weekId,
      t.employeeId,
      t.positionId,
      t.date,
      t.period
    ),
  })
);

/* ---------------------------------------------------------------------- */
/* Ledger — petty cash / vendor expense tracking (2026-08-14)             */
/* ---------------------------------------------------------------------- */
// Phase 1 of the Ledger feature, built from studying Soothr's real
// " 2026 - C.xlsx" (petty cash / supplier check / card) DNA file — see
// project_atlas_dna_petty_cash_expense memory for the full source study.
// Scope confirmed with Oliver 2026-08-14: v1 covers the vendor directory
// and Petty Cash (itemized payouts + daily cash-drawer reconciliation).
// Supplier Check, Card (a weekly/periodic bank-statement batch reconcile,
// not a real-time log — different shape, deliberately not attempted yet),
// receipt photos, and the consolidated PDF/image report are later rounds.

// A restaurant-configurable vendor/supplier directory (2026-08-14) —
// admin-managed like Positions, retire-not-delete for the same reason
// (historical petty cash / supplier check rows should keep referencing a
// real name even after a vendor is no longer used). Address fields exist
// now for a later check-export feature (the DNA file's "Export" sheet
// formats a QuickBooks-style Pay/Amount/Memo/PayeeName/PayeeAddress
// check-print sheet) — not used yet in v1, but cheap to capture at
// creation time instead of a later migration. Seeded from Soothr's real
// vendor list at Oliver's request ("for testing sake") — Youk Thai is
// expected to edit/replace these with its own real vendors before going
// live, same "DNA is a guideline, not real data" precedent as everywhere
// else in this project.
export const ledgerVendors = sqliteTable("ledger_vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  payeeAddressLine1: text("payee_address_line_1"),
  payeeAddressLine2: text("payee_address_line_2"),
  payeeAddressLine3: text("payee_address_line_3"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Expense categories (Bar/Food/Mis/PAYROLL BOH/etc in Soothr's sheet) —
// deliberately a restaurant-configurable table, not a hardcoded enum,
// same reasoning as Positions: category NAMES are Soothr-specific, and
// Youk Thai (or any future restaurant Atlas is sold to) should be able to
// rename/add/retire categories without a code change.
//
// pnlGroup (2026-08-16, Analytics/P&L feature): which P&L bucket this
// category rolls up into, so the P&L can group correctly without
// pattern-matching on category NAME (which is freely renameable). Confirmed
// with Oliver/Aey: Food, non-alcoholic Drinks (soda/soft drinks), and Bar
// (alcohol/mocktails/bar program) are tracked as three SEPARATE cost lines,
// not blended into one "food cost" — standard restaurant practice, since
// liquor cost runs a very different % of revenue than food cost.
// PAYROLL BOH/PAYROLL FOH categories are tagged EXCLUDED: Atlas's own
// computed shift-wage data (employeePayouts) is the P&L's payroll source of
// truth (confirmed with Oliver), so a ledger entry logged under those
// categories would double-count if it were also summed here. The category
// itself isn't deleted (historical entries still reference it) — it's just
// left out of the P&L rollup, and the categories admin page notes why.
export const ledgerCategories = sqliteTable("ledger_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  pnlGroup: text("pnl_group", {
    enum: ["FOOD", "BEVERAGE_NONALC", "BEVERAGE_ALC", "OTHER_EXPENSE", "EXCLUDED"],
  })
    .notNull()
    .default("OTHER_EXPENSE"),
});

// One row per petty cash payout. vendorId is nullable on purpose — a real
// chunk of Soothr's actual entries are informal cash handoffs with no
// vendor ("Pay out to Tommy: Pom, Lemon, Wasabi"), not a real supplier
// relationship; `note` carries that free-text description either way.
// Deliberately no `active`/soft-delete here (unlike Positions/Vendors) --
// see deletePettyCashEntry in lib/actions/ledger.ts for why entries are
// only removable before that DAY's reconciliation is finalized, and hard-
// deleted (not retired) up to that point, matching the same "draft vs.
// published" trust boundary already used by the Schedule Planner.
export const pettyCashEntries = sqliteTable("petty_cash_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // ISO date string
  vendorId: integer("vendor_id").references(() => ledgerVendors.id),
  categoryId: integer("category_id").notNull().references(() => ledgerCategories.id),
  note: text("note"),
  amount: real("amount").notNull(),
  photoUrl: text("photo_url"), // reserved for a later round -- see PROGRESS.md
  createdByEmployeeId: integer("created_by_employee_id").notNull().references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// One row per calendar date's cash-drawer reconciliation -- the "opening
// manager counts the drawer against what the closing manager handed over"
// ritual Oliver described. Sales cash / Tip cash are DELIBERATELY NOT
// columns here -- they're computed live from that date's shiftSales rows
// (see lib/ledger/loadPettyCashDay.ts) rather than re-entered, so the
// number can never quietly drift from the Closing Report's own figures.
// Only what genuinely has no other source of truth lives here:
// beginningBalance (carried from yesterday, editable in case of a real
// discrepancy), otherCash (misc cash adjustments, matches the DNA sheet's
// "Other" column), and countedAmount (the manager's actual physical
// count, compared against the computed expected total). Confirmed with
// Oliver 2026-08-14: finalizing a day's reconciliation is blocked until
// every Shift for that date is itself finalized ("you supposed not to
// close daily expenses without knowing what cash we would get from
// register anyway") -- see lib/actions/ledger.ts's finalizePettyCashDay.
export const dailyCashReconciliations = sqliteTable("daily_cash_reconciliations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  beginningBalance: real("beginning_balance").notNull().default(0),
  otherCash: real("other_cash").notNull().default(0),
  // Why cash was added to the drawer, e.g. "top-up from BofA account"
  // (Oliver, 2026-08-22). Nullable in the schema because every row that
  // existed before this column has no reason to record -- but the app
  // REQUIRES it whenever otherCash is non-zero. Money appearing in a
  // drawer with no stated reason is exactly what a reconciliation exists
  // to catch, so the constraint lives in lib/actions/ledger.ts where it
  // can produce a readable message rather than a NOT NULL failure.
  otherCashReason: text("other_cash_reason"),
  countedAmount: real("counted_amount"), // null until the opening manager enters their physical count
  note: text("note"), // e.g. explaining a mismatch between counted vs. expected
  status: text("status", { enum: ["draft", "finalized"] }).notNull().default("draft"),
  finalizedAt: text("finalized_at"),
  finalizedByEmployeeId: integer("finalized_by_employee_id").references(() => employees.id),
});

// Activity log — one row per notable action, across every subsystem
// (2026-08-22). Deliberately GENERAL from the first row rather than a
// per-feature audit table: Oliver's ask is an "Activity log center and tag
// for each type of log", readable by Partner, Admin, and a
// permission-granted Assistant Manager, and the Permission System backlog
// already carried an unscoped "unified Activity Log page". Building a
// bespoke petty-cash-only table now would mean migrating it later for no
// reason.
//
// `type` is the tag the Centre filters on. Dotted namespace so the
// subsystem is greppable and new kinds slot in without a schema change:
//   petty_cash.entry.updated, petty_cash.entry.deleted,
//   petty_cash.day.finalized, petty_cash.day.admin_edited
//
// `summary` is PRE-RENDERED human-readable text, on purpose. A log has to
// stay readable years later, after the row it describes has been edited or
// deleted and after the category it referenced was renamed -- so the
// sentence is frozen at write time rather than reconstructed at read time
// from records that have moved on.
//
// `detail` holds the before/after JSON for anyone who needs the specifics.
// `entityId` is text, not integer, because some subjects are keyed by date
// ("2026-08-22") rather than by a numeric id.
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: text("at").notNull().default(sql`(current_timestamp)`),
    actorEmployeeId: integer("actor_employee_id").notNull().references(() => employees.id),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    detail: text("detail"),
  },
  (t) => ({
    // The Centre's two primary reads: newest-first, and filtered by tag.
    atIdx: index("activity_log_at_idx").on(t.at),
    typeIdx: index("activity_log_type_idx").on(t.type),
    entityIdx: index("activity_log_entity_idx").on(t.entityType, t.entityId),
  })
);

// Supplier Check — invoice-based vendor payments (2026-08-14, extended
// 2026-08-14 after Oliver talked to Aey about the real workflow). Three-
// stage lifecycle, not two: an invoice is logged PENDING when it
// arrives; a check is PRINTED for a vendor, which always combines EVERY
// currently-pending invoice for that vendor into one check ("same
// vendor always get combined check") -- either instantly (e.g. a
// maintenance vendor that needs a check right after service) or as part
// of the weekly batch export (Aey's words: "all invoices always get
// export to check format at the end of the week"); the check is then
// marked PAID once it's actually been handed to the supplier. No due
// date field -- confirmed NOT needed ("supplier check no need due
// date"). photoUrl reserved, unused, same as pettyCashEntries -- doesn't
// block a later photo-attachment round with a migration.
export const supplierInvoices = sqliteTable("supplier_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receivedDate: text("received_date").notNull(), // ISO date -- the delivery date
  vendorId: integer("vendor_id").notNull().references(() => ledgerVendors.id),
  categoryId: integer("category_id").notNull().references(() => ledgerCategories.id),
  invoiceNumber: text("invoice_number").notNull(),
  description: text("description"), // "nature or package" -- what was delivered
  amount: real("amount").notNull(),
  photoUrl: text("photo_url"),
  status: text("status", { enum: ["pending", "printed", "paid"] }).notNull().default("pending"),
  paymentId: integer("payment_id").references(() => supplierCheckPayments.id),
  createdByEmployeeId: integer("created_by_employee_id").notNull().references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// One row per check written -- confirmed with Oliver: "printed payment
// check can reconcile into one check for each supplier," i.e. one check
// can settle SEVERAL pending invoices from the same vendor at once
// (matches the real DNA export sheet, where e.g. K.D. Market's two
// invoice numbers were batched under one check payment). vendorId is
// denormalized here even though every linked supplierInvoices row
// already has its own vendorId, because a payment is conceptually
// scoped to one vendor -- keeps the query for "this vendor's payment
// history" simple without joining back through invoices first.
//
// `status`/`deliveredAt`/`deliveredByEmployeeId` added 2026-08-14 for
// the Printed -> Paid stage. `paidDate`/`paidByEmployeeId` keep their
// v45 names for a purely-additive migration, but their real meaning
// shifted: `paidDate` is the date the check was PRINTED/generated (not
// necessarily when it was handed over), and `paidByEmployeeId` is who
// printed it -- `deliveredAt`/`deliveredByEmployeeId` are the actual
// "handed to the supplier" moment.
export const supplierCheckPayments = sqliteTable("supplier_check_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendor_id").notNull().references(() => ledgerVendors.id),
  paidDate: text("paid_date").notNull(), // the check's print/generation date -- see comment above
  checkNumber: text("check_number"),
  totalAmount: real("total_amount").notNull(),
  paidByEmployeeId: integer("paid_by_employee_id").notNull().references(() => employees.id), // who printed the check -- see comment above
  status: text("status", { enum: ["printed", "paid"] }).notNull().default("printed"),
  deliveredAt: text("delivered_at"), // set when a manager marks the check as delivered/paid to the supplier
  deliveredByEmployeeId: integer("delivered_by_employee_id").references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// Append-only audit trail for Supplier Check (2026-08-15, Oliver:
// "as it concern money it should have a log who do what when with the
// check and why edit print check"). Two actions logged so far --
// EDITED_INVOICE (see editSupplierInvoice in lib/actions/
// supplierCheck.ts, always requires a reason) and PRINTED_CHECK (see
// printSupplierCheck, no reason -- it's a routine workflow step, not a
// correction). `details` is a JSON blob whose shape depends on
// `action`: for EDITED_INVOICE, {invoiceNumberBefore/After,
// descriptionBefore/After, amountBefore/After}; for PRINTED_CHECK,
// {checkNumber, totalAmount, invoiceIds}. Same denormalized
// performedByName pattern as scheduleChangeLog, for the same reason --
// the log should still read right even if that employee's name later
// changes. invoiceId/paymentId are both nullable since a PRINTED_CHECK
// event isn't about one specific invoice, and an EDITED_INVOICE on a
// still-Pending invoice has no paymentId yet.
export const supplierCheckAuditLog = sqliteTable("supplier_check_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").references(() => supplierInvoices.id),
  paymentId: integer("payment_id").references(() => supplierCheckPayments.id),
  vendorId: integer("vendor_id").notNull().references(() => ledgerVendors.id),
  action: text("action", { enum: ["EDITED_INVOICE", "PRINTED_CHECK"] }).notNull(),
  performedByEmployeeId: integer("performed_by_employee_id").notNull().references(() => employees.id),
  performedByName: text("performed_by_name").notNull(),
  reason: text("reason"), // required (enforced in the action) for EDITED_INVOICE, always null for PRINTED_CHECK
  details: text("details").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// Card — the third Ledger channel (2026-08-16), deliberately NOT the
// log-as-you-go shape Petty Cash/Supplier Check use. Confirmed with
// Oliver before building (see project_atlas_home_page-adjacent design
// conversation, and project_atlas_dna_petty_cash_expense's note that the
// DNA file's own "Card" sheet was an empty template -- Aey pulls Card
// transactions from the bank/credit-card statement in a batch, weekly or
// more often once charges settle, not in real time): the real unit of
// work is "reconcile one card's statement period against its total,"
// not "log a purchase the moment it happens."
//
// ledgerCards is retire-not-delete, same pattern as ledgerVendors/
// ledgerCategories -- Youk Thai may have more than one card (the DNA
// sheet's own "Card" column implied this), each with its own separate
// monthly/weekly statement.
export const ledgerCards = sqliteTable("ledger_cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // e.g. "Amex ...1234"
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// One row per statement period for one card (e.g. "Amex ...1234, Aug
// 2026"). statementTotal is the manager's typed-in total from the real
// paper/PDF statement -- the reconciliation TARGET, same role
// dailyCashReconciliations' physical count plays for Petty Cash, just at
// the period level instead of daily. A period stays "draft" while
// transactions are being logged against it and can only become
// "reconciled" once the logged transactions sum to statementTotal (see
// reconcileCardStatementPeriod in lib/actions/card.ts) -- deliberately
// as strict as Petty Cash's drawer-count discipline, not the looser
// just-a-log shape Supplier Check uses, since Oliver confirmed a forced
// match is what he wants here.
export const cardStatementPeriods = sqliteTable("card_statement_periods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardId: integer("card_id").notNull().references(() => ledgerCards.id),
  periodStart: text("period_start").notNull(), // ISO date
  periodEnd: text("period_end").notNull(), // ISO date
  statementTotal: real("statement_total").notNull(),
  status: text("status", { enum: ["draft", "reconciled"] }).notNull().default("draft"),
  reconciledAt: text("reconciled_at"),
  reconciledByEmployeeId: integer("reconciled_by_employee_id").references(() => employees.id),
  createdByEmployeeId: integer("created_by_employee_id").notNull().references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// One row per line on the statement, entered manually while going down
// the statement (confirmed with Oliver: manual entry, not a CSV/bank
// import, for v1). No vendor/payee field -- unlike Petty Cash/Supplier
// Check, a card charge's "who" is usually already obvious from `memo`
// (a subscription name, an online order, etc.) and there's no vendor
// directory relationship to preserve here. amount is signed (a card
// statement legitimately includes refunds/credits alongside charges),
// unlike Petty Cash's amount which is always a positive payout.
export const cardTransactions = sqliteTable("card_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  statementPeriodId: integer("statement_period_id").notNull().references(() => cardStatementPeriods.id),
  date: text("date").notNull(), // ISO date -- the charge date from the statement
  categoryId: integer("category_id").notNull().references(() => ledgerCategories.id),
  memo: text("memo"),
  amount: real("amount").notNull(),
  createdByEmployeeId: integer("created_by_employee_id").notNull().references(() => employees.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

// Leave requests (2026-08-16, Schedule Planner Phase D) -- design
// resolved 2026-08-11, confirmed self-service/no-approval on 2026-08-16
// before building. Oliver's framing: by the time an employee logs one of
// these, they've usually already told the manager informally ("Manager
// คะ หนูตไปเที่ยวแล้วค่ะ") -- this isn't an approval gate, it's a way to
// PUSH that already-agreed absence into a log/calendar so the manager
// doesn't forget. Any employee can create their own row (see
// submitLeaveRequest in lib/actions/leave.ts); there's no status field
// on purpose -- nothing to approve or deny.
//
// Deliberately does NOT touch employeeScheduleTemplates at all -- a
// leave period is a temporary interruption to the recurring pattern,
// not a change to it (unlike RESIGNATION/PROMOTION, which really do
// change the template going forward). Instead, when the Weekly Plan is
// built/viewed for a week overlapping a leave request's date range, that
// employee's template-sourced slots in that week get auto-flagged as
// needing coverage -- a DERIVED effect computed in loadWeeklyPlan.ts at
// read time, not a persistent mutation anywhere else.
export const leaveRequests = sqliteTable("leave_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  startDate: text("start_date").notNull(), // ISO date, inclusive
  endDate: text("end_date").notNull(), // ISO date, inclusive
  note: text("note"),
  loggedAt: text("logged_at").notNull().default(sql`(current_timestamp)`),
  // Approval flow added 2026-08-24 (Oliver reversed the original
  // no-approval design): new requests start "pending"; anyone holding
  // SCHEDULE_MANAGE can approve/deny. Pre-existing rows were backfilled
  // to "approved" in the migration — they were logged under the
  // no-approval regime, i.e. already agreed informally.
  status: text("status", { enum: ["pending", "approved", "denied"] })
    .notNull()
    .default("pending"),
  decidedByEmployeeId: integer("decided_by_employee_id").references(() => employees.id),
  decidedAt: text("decided_at"),
});

// Notification read-tracking (2026-08-16) -- Oliver asked for a "red
// pill" unseen-count badge in the nav, starting with the manager-facing
// leave requests inbox. Deliberately generic (one row per employee +
// section, not a leave-specific column) so the same table extends to
// the shift-swap inbox later without a schema change -- just a new
// `section` string key (e.g. "swap_requests") and a matching loader.
//
// No row for a given employee+section means "never visited" -- treated
// by the loader as everything in that section being unseen, not zero.
// A visit upserts lastSeenAt to now (see lib/actions/notifications.ts),
// which is deliberately simpler than trying to track a per-item read
// flag: "you looked at the inbox" is enough granularity for a log-not-
// queue feature like leave requests.
export const notificationSeen = sqliteTable(
  "notification_seen",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    section: text("section").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => ({
    employeeSectionUnique: uniqueIndex("notification_seen_employee_section_idx").on(
      table.employeeId,
      table.section
    ),
  })
);

// Shift swap requests (2026-08-16, Schedule Planner Phase E) -- design
// confirmed with Oliver across two AskUserQuestion rounds before any
// code, same discipline as every other feature here. Modeled on his own
// framing: "Employee A requests a swap -> Employee B accepts or
// declines -> manager notified" (flight-crew style), replacing the
// current paper-schedule cross-out-a-name process.
//
// Tied to one specific plannedShiftAssignments row (a single shift
// instance, not the recurring template) -- same "temporary, not
// permanent" scope as leaveRequests. Only PUBLISHED-week assignments can
// be offered (confirmed: draft weeks aren't real commitments yet).
//
// status state machine:
//   open -> (someone eligible accepts) -> either:
//     - completed                          (shift is >3 days out: no
//       approval needed, reassigns immediately, manager just notified)
//     - pending_manager_approval            (shift is <=3 days out: needs
//       a manager decision before the reassignment actually happens)
//   pending_manager_approval -> completed   (manager approves)
//   pending_manager_approval -> declined    (manager declines -- shift
//     REVERTS to the original requester, confirmed with Oliver; nothing
//     else happens automatically, they'd have to post a new request)
//   open -> cancelled                       (requester withdraws before
//     anyone's accepted -- confirmed allowed, self-service like leave)
//
// requestingEmployeeId is stored explicitly (not just read off the
// assignment) because completing a swap changes
// plannedShiftAssignments.employeeId to the new person -- this column
// is the only record of who originally held the shift, for history and
// for the "reverts to the original requester" decline behavior.
//
// Eligibility to accept (enforced in lib/actions/swap.ts, not at the DB
// layer): must actively hold the assignment's position
// (employeePositions), must not be the requester, must not already be
// assigned to a different position at that exact date+period, and must
// not be on logged leave that day. Completing a swap (whether immediate
// or after manager approval) also syncs the matching shiftRosterEntries
// row if a real `shifts` row already exists for that date/period
// (createShift's auto-seed only copies the plan into the real roster
// ONCE, at shift-creation time -- see seedRosterFromPublishedPlan's own
// comment -- so a swap after that point needs to update both rows to
// keep payroll/tips correct). Refuses to complete at all if that real
// shift has already been finalized (payroll-locked), matching the
// finalize-locks-everything pattern used elsewhere (Card statement
// periods, Closing Report).
export const swapRequests = sqliteTable("swap_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assignmentId: integer("assignment_id").notNull().references(() => plannedShiftAssignments.id),
  requestingEmployeeId: integer("requesting_employee_id").notNull().references(() => employees.id),
  acceptingEmployeeId: integer("accepting_employee_id").references(() => employees.id),
  status: text("status", {
    enum: ["open", "pending_manager_approval", "completed", "declined", "cancelled"],
  })
    .notNull()
    .default("open"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  respondedAt: text("responded_at"), // set when someone accepts, whichever path follows
  decidedAt: text("decided_at"), // set only when a manager approves/declines
  decidedByEmployeeId: integer("decided_by_employee_id").references(() => employees.id),
});

/* ---------------------------------------------------------------------- */
/* Payroll — weekly payroll register (2026-08-17)                          */
/* ---------------------------------------------------------------------- */

// Aggregates each employee's already-computed shift payouts
// (finalizeShift.ts's totalCorePayout — wage+extra+incentive-deduction+
// tip, the exact amount an employee is owed) across a Monday-Sunday pay
// week, matching the weekly cadence Soothr's real payroll DNA file
// (" 2026.xlsx") uses. Deliberately reuses Atlas's own already-computed
// numbers rather than re-deriving payroll math — same "don't duplicate
// the source of truth" precedent as loadPayrollCost.ts (Analytics) and
// My Pay.
//
// Two states, same "compute live, then lock a snapshot" pattern as
// finalizeShift.ts / Card's statement periods: while DRAFT, a week's
// numbers are always computed live from employeePayouts (nothing goes
// stale while Oliver is still deciding); marking a week PAID snapshots
// each employee's totals into payrollPeriodEmployeeTotals at that exact
// moment — a locked historical record that won't silently change later
// if a shift is edited/refinalized. Blocked entirely (see
// markPayrollPeriodPaid in lib/actions/payroll.ts) unless every shift
// that exists in that week is already finalized, same "can't reconcile
// before the source data is locked" rule Ledger/Card already enforce.
export const payrollPeriods = sqliteTable(
  "payroll_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    weekStartDate: text("week_start_date").notNull(), // Monday, ISO date
    weekEndDate: text("week_end_date").notNull(), // Sunday, ISO date
    status: text("status", { enum: ["draft", "paid"] }).notNull().default("draft"),
    paidAt: text("paid_at"),
    paidByEmployeeId: integer("paid_by_employee_id").references(() => employees.id),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqWeekStart: uniqueIndex("uniq_payroll_week_start").on(t.weekStartDate),
  })
);

// One row per employee per PAID payroll period — the locked snapshot.
// Mirrors employeePayouts' own column shape (wage/extra/incentive/
// deduction/tip/total) summed across that week's finalized shifts, plus
// shiftCount for context. Only ever written by markPayrollPeriodPaid;
// deleted and rewritten if an ADMIN reverts a period back to draft to
// correct it (see revertPayrollPeriodToDraft), same override precedent
// as Ledger/Card/Supplier Check's finalized-record admin exception.
export const payrollPeriodEmployeeTotals = sqliteTable("payroll_period_employee_totals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollPeriodId: integer("payroll_period_id").notNull().references(() => payrollPeriods.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  shiftCount: integer("shift_count").notNull().default(0),
  flatWageAmount: real("flat_wage_amount").notNull().default(0),
  extraPayAmount: real("extra_pay_amount").notNull().default(0),
  incentiveAmount: real("incentive_amount").notNull().default(0),
  deductionAmount: real("deduction_amount").notNull().default(0),
  tipPoolShare: real("tip_pool_share").notNull().default(0),
  hostUpsellTipShare: real("host_upsell_tip_share").notNull().default(0),
  totalTip: real("total_tip").notNull().default(0),
  totalCorePayout: real("total_core_payout").notNull().default(0),
});

/* ---------------------------------------------------------------------- */
/* Permission System — Foundation (2026-08-19)                             */
/* Design confirmed 2026-08-17, expanded/finalized/scrutinized 2026-08-18  */
/* — see project_atlas_permission_system memory for the full spec. This is */
/* Phase 1 ("Foundation") of a multi-phase build Oliver explicitly chose   */
/* to sequence first (2026-08-19): the capability schema + Admin-only      */
/* "Permission and Roles" page. Later phases (not yet built): the          */
/* server-action capability audit (every lib/actions/*.ts file must be     */
/* checked against these flags — publishWeek in schedule.ts currently has  */
/* NO auth check at all, confirmed 2026-08-19), the activation-link/step-  */
/* up-PIN login rework, the People contact-info/HR-sensitive field tiers,  */
/* Tip Pool structure tightening, and the Schedule log expansion +         */
/* Activity Log page. Nothing below is enforced anywhere yet — it's        */
/* storage + an admin UI to manage it, ready for later phases to read.     */
/* ---------------------------------------------------------------------- */

// Capability-checkbox model (CONFIRMED design) — NOT a fixed role enum.
// Each employee account has independently-togglable capability flags,
// keyed by a stable string (see lib/permissions/capabilities.ts for the
// registry of valid keys, categories, and which are per-item-expirable).
// "Partner"/"Floor Manager"/"Assistant Manager"/"Admin"/"Staff" are UX
// preset BUNDLES applied at grant time (see applyAccountTypePreset in
// lib/actions/permissions.ts) — not stored anywhere as a binding; only
// the resulting per-capability rows below are what any auth check ever
// reads. One row per (employeeId, capabilityKey) — upserted, not
// deleted, on every change, so a capability's history (when it was
// granted/revoked/expired) stays reconstructable from permissionGrantLog
// even after being toggled off. expiresAt is only meaningful for the
// Financial Auditor subset's per-item-expirable capabilities (see
// registry) — null means "no expiry" for everything else.
export const employeeCapabilities = sqliteTable(
  "employee_capabilities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    capabilityKey: text("capability_key").notNull(),
    granted: integer("granted", { mode: "boolean" }).notNull().default(false),
    expiresAt: text("expires_at"), // ISO date string; null = no expiry
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqEmployeeCapability: uniqueIndex("uniq_employee_capability").on(t.employeeId, t.capabilityKey),
  })
);

// Every capability grant/revoke, including Admin's own — Oliver was
// explicit this must be logged ("ล็อกการให้สิทธิ์ไว้ด้วย เผื่อฉันโกง",
// roughly "log the permission grants too, in case I cheat"). Append-only,
// never updated/deleted. Not yet surfaced in a viewer page — same pattern
// as schedule_change_log before its Activity Log viewer existed; this
// table exists so the audit trail starts accumulating from Phase 1
// onward, with no retroactive gap once the unified Activity Log page
// (a later phase) is built to display it.
export const permissionGrantLog = sqliteTable("permission_grant_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id), // whose capability changed
  capabilityKey: text("capability_key").notNull(),
  action: text("action", { enum: ["GRANTED", "REVOKED"] }).notNull(),
  expiresAt: text("expires_at"), // the expiry value at the moment of this change, if any
  actingEmployeeId: integer("acting_employee_id").notNull().references(() => employees.id), // the Admin who made the change
  note: text("note"), // e.g. "applied Floor Manager preset" for bulk preset-apply actions
  occurredAt: text("occurred_at").notNull().default(sql`(current_timestamp)`),
});
