/**
 * Permission System — capability registry (2026-08-19, Phase 1
 * "Foundation" of the confirmed-but-not-yet-fully-built design in
 * project_atlas_permission_system memory).
 *
 * This is the single source of truth for every capability key that
 * exists in the app, which category it belongs to (for the "Permission
 * and Roles" page's grouping), whether it supports a per-item expiry
 * (only the Financial Auditor subset does), and what each Account Type
 * preset bundle grants by default. Nothing outside this file should
 * hardcode a capability key string.
 *
 * IMPORTANT — this is storage + an admin UI only. No existing server
 * action reads any of this yet; that's a later, explicitly separate
 * phase (auditing every lib/actions/*.ts file, starting with
 * publishWeek in schedule.ts, which has zero auth check today). Do not
 * assume a capability being "false" here actually blocks anything in
 * the app until that phase lands — see the schema.ts comment above
 * employeeCapabilities for the full phase breakdown.
 */

export const CAPABILITY_CATEGORIES = [
  "GENERAL",
  "FINANCIAL_AUDITOR",
  "TIP_POOL",
  "PEOPLE",
  "SCHEDULE",
] as const;
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

export const ACCOUNT_TYPES = ["STAFF", "ASSISTANT_MANAGER", "FLOOR_MANAGER", "PARTNER", "ADMIN"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  STAFF: "Staff",
  ASSISTANT_MANAGER: "Assistant Manager",
  FLOOR_MANAGER: "Floor Manager",
  PARTNER: "Partner",
  ADMIN: "Admin",
};

export interface CapabilityDef {
  key: string;
  category: CapabilityCategory;
  label: string;
  description: string;
  /** Only Financial Auditor subset items support a per-item expiry date
   * (design confirmed 2026-08-17/18) — everything else is a standing
   * on/off flag with no expiry field shown in the UI. */
  expirable: boolean;
  /** Default grant per Account Type preset, applied by
   * applyAccountTypePreset (lib/actions/permissions.ts) when an Admin
   * assigns a preset to an account. Individual capabilities can always
   * be overridden per-account afterward — this is only the starting
   * bundle, never a live/enforced binding. */
  defaults: Record<AccountType, boolean>;
  /** True for a key that is defined here but that nothing in the app
   * currently checks (2026-08-23).
   *
   * Every key in this registry renders a switch on /permissions, so a key
   * with no enforcement is not neutral — it tells an Admin they have
   * restricted something they have not. Rather than delete these (they
   * record real intent for features that do not exist yet), the
   * permissions screen reads this flag and says so plainly.
   *
   * Keep it honest in both directions: setting this on a key that IS
   * enforced would understate real access, and leaving it off a key that
   * is not is the bug it exists to prevent. The sweep that finds drift is
   * per-key, over `requireCapability("K")` / `has("K")` — see the
   * "inert capability keys" note in project memory. */
  notYetEnforced?: true;
}

const ALL_FALSE: Record<AccountType, boolean> = {
  STAFF: false,
  ASSISTANT_MANAGER: false,
  FLOOR_MANAGER: false,
  PARTNER: false,
  ADMIN: false,
};

/** Shorthand for the common "Admin + Partner only" General pattern. */
function adminPartner(overrides: Partial<Record<AccountType, boolean>> = {}): Record<AccountType, boolean> {
  return { ...ALL_FALSE, ADMIN: true, PARTNER: true, ...overrides };
}

/** Shorthand for "all four manager-tier bundles" (Admin/Partner/Floor
 * Manager/Assistant Manager) — Staff is never included by this helper,
 * matching the spec's General capability list which only ever discusses
 * "all four" among the manager-tier presets. */
function allManagerTiers(overrides: Partial<Record<AccountType, boolean>> = {}): Record<AccountType, boolean> {
  return { ...ALL_FALSE, ADMIN: true, PARTNER: true, FLOOR_MANAGER: true, ASSISTANT_MANAGER: true, ...overrides };
}

export const CAPABILITIES: CapabilityDef[] = [
  // ---- General (no expiry) — confirmed 2026-08-17, reconfirmed 2026-08-18 ----
  {
    key: "VIEW_ANALYTICS",
    category: "GENERAL",
    label: "View Analytics dashboard",
    description: "See the Analytics dashboard.",
    expirable: false,
    defaults: adminPartner(),
  },
  {
    key: "VIEW_PNL",
    category: "GENERAL",
    label: "View P&L report",
    description: "See the profit & loss report.",
    expirable: false,
    defaults: adminPartner(),
  },
  {
    key: "VIEW_SETTINGS",
    category: "GENERAL",
    label: "View Settings pages",
    description:
      "See the Settings pages. Partner sees them read-only (visible-but-disabled) unless also granted Edit Settings.",
    expirable: false,
    defaults: adminPartner(),
  },
  {
    key: "EDIT_SETTINGS",
    category: "GENERAL",
    label: "Edit Settings (non-financial)",
    description: "Change restaurant-wide settings. Admin only by default.",
    expirable: false,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "VIEW_LEDGER_OVERVIEW",
    category: "GENERAL",
    label: "View Ledger overview/report",
    description: "See the Ledger overview and report.",
    expirable: false,
    defaults: allManagerTiers(),
  },
  {
    key: "VIEW_ACTIVITY_LOG",
    category: "GENERAL",
    label: "View the Activity Log",
    description:
      "See the Activity Log — who changed what, and when. Admin and Partner by default; grant it to an Assistant Manager who needs oversight.",
    expirable: false,
    // Oliver, 2026-08-22: "partner and permission-granted assistant manager
    // and admin can see log." Admin+Partner by default, and ASSISTANT_MANAGER
    // is already an account type here, so "permission-granted" is the
    // existing per-account override rather than anything new — no role tier
    // had to be invented to honour this.
    defaults: adminPartner(),
  },
  {
    key: "VIEW_LEDGER_CARD_REPORT",
    category: "GENERAL",
    label: "View Ledger Card report (read-only)",
    description: "See the Ledger Card report.",
    expirable: false,
    defaults: adminPartner(),
  },
  {
    key: "PETTY_CASH_EDIT",
    category: "GENERAL",
    label: "Petty Cash: enter/edit",
    description: "Enter and edit Petty Cash records.",
    expirable: false,
    defaults: allManagerTiers(),
  },
  {
    key: "SUPPLIER_CHECK_LOG",
    category: "GENERAL",
    label: "Supplier Check: log/print",
    description: "Log Supplier Check invoices and print checks for them.",
    // Narrowed 2026-08-23 (Oliver): this used to read "log/print/mark paid"
    // and cover the whole lifecycle. Marking a printed check paid/delivered
    // is now its own capability, FA_SUPPLIER_CHECK_FINALIZE below -- the
    // last step before a payment is settled belongs with the person doing
    // the reconciling, not with everyone who can log an invoice.
    expirable: false,
    defaults: allManagerTiers(),
  },
  {
    key: "MANAGE_PERMISSIONS",
    category: "GENERAL",
    label: "Manage Permissions",
    description: "Grant/revoke capabilities on other accounts. Admin only, not delegable.",
    expirable: false,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },

  // ---- Financial Auditor subset (grantable, per-item expiry) — corrected 2026-08-18 scrutinize pass ----
  {
    key: "FA_EDIT_FINANCIAL_SETTINGS",
    category: "FINANCIAL_AUDITOR",
    label: "Edit financial Settings (CC tip deduction %)",
    description: "Edit the credit-card tip deduction rate. (Tip pool membership is governed separately — see Tip Pool structure.)",
    // Settings saves as one action gated on EDIT_SETTINGS; separating the
    // financial fields would mean splitting the Settings form, which is a
    // feature, not a wiring. Labelled rather than built (Oliver, 2026-08-23).
    notYetEnforced: true,
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  // 2026-08-21 — Oliver confirmed the restaurant card itself is currently
  // held only by Partner tier and above: "card would hold by partner
  // tier or above and they're only people who can do card reconciliation
  // for now." All three Ledger Card FA_* items default to Admin+Partner
  // (not Admin-only like the rest of this subset) to match. Oliver also
  // flagged this as forward-looking, not fixed forever: "one day when we
  // got GM or Assistant manager right might fall into them to leverage
  // work" — deliberately NOT built ahead of that; the existing
  // per-account override (see Core architectural decision) already
  // covers a future one-off grant to a specific Floor Manager/Assistant
  // Manager/GM account without needing a registry change when that day
  // comes. Note this only sets the *default* going forward (new hires,
  // future preset re-applications) — it does not retroactively grant
  // these to Aey's existing capability rows; that's a separate manual
  // /permissions step, see project_atlas_permission_system memory.
  {
    key: "FA_LEDGER_CARD_IMPORT",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: import",
    description: "Import Ledger Card transactions.",
    // There is no CSV/bank import feature to gate -- this key was defined
    // ahead of the feature. Nothing to enforce until one exists.
    notYetEnforced: true,
    expirable: true,
    defaults: adminPartner(),
  },
  {
    key: "FA_LEDGER_CARD_CATEGORIZE",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: categorize",
    description: "Categorize Ledger Card transactions.",
    // Blocked on a structural gap, not on this key: card transaction entry
    // runs on card.ts's file-local requireManagerAction() because Card has
    // no GENERAL day-to-day-entry capability the way Petty Cash has
    // PETTY_CASH_EDIT and Supplier Check has SUPPLIER_CHECK_LOG. Gating
    // entry on a Financial Auditor key would be a real access reduction
    // for every manager who enters card transactions today. Add the
    // missing GENERAL key first; then this one has something coherent to
    // sit beside.
    notYetEnforced: true,
    expirable: true,
    defaults: adminPartner(),
  },
  {
    key: "FA_LEDGER_CARD_RECONCILE",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: reconcile",
    description: "Reconcile the Ledger Card report.",
    expirable: true,
    defaults: adminPartner(),
  },
  {
    key: "FA_SUPPLIER_CHECK_EDIT_LOCKED",
    category: "FINANCIAL_AUDITOR",
    label: "Supplier Check: edit locked invoice",
    description: "Edit a Supplier Check invoice that's already Printed/Paid.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_SUPPLIER_CHECK_FINALIZE",
    category: "FINANCIAL_AUDITOR",
    label: "Supplier Check: mark paid",
    description: "Mark a printed Supplier Check as paid/delivered to the vendor.",
    // Wired up 2026-08-23 (Oliver). Until then this key existed in the
    // registry, appeared on /permissions, and guarded nothing -- SUPPLIER_
    // CHECK_LOG's own label already claimed "mark paid," so which action
    // this was meant to gate was flagged as an open question rather than
    // guessed. It now gates markSupplierCheckPaid in
    // lib/actions/supplierCheck.ts, and SUPPLIER_CHECK_LOG was narrowed to
    // match. Default is unchanged (Admin-only), so the Financial Auditor
    // subset invariant in __tests__/capabilities.test.ts still holds.
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_PAYROLL_PRINT_EXPORT",
    category: "FINANCIAL_AUDITOR",
    label: "Payroll: print/export checks",
    description: "Print and export payroll checks.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_PAYROLL_LOCK_FINALIZE",
    category: "FINANCIAL_AUDITOR",
    label: "Payroll: lock & finalize",
    description: "Lock and finalize a payroll period.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },

  // ---- Tip Pool structure — NEW, confirmed 2026-08-18, sole source of truth ----
  {
    key: "TIP_POOL_STRUCTURE_EDIT",
    category: "TIP_POOL",
    label: "Tip Pool structure: edit (position↔pool assignment, split method)",
    description:
      "Edit which pool(s) a position participates in and each pool's split method. Deliberately tighter than today's shipped behavior — Floor Manager/Assistant Manager default to visible-but-disabled, a genuine access reduction from today's any-MANAGER-can-edit behavior.",
    expirable: false,
    defaults: adminPartner(),
  },

  // ---- People tiers — NEW, resolved 2026-08-18 ----
  {
    key: "PEOPLE_CONTACT_INFO_VIEW",
    category: "PEOPLE",
    label: "People: view contact info (phone, email, DOB)",
    description: "View mobile phone, email, and date of birth on employee records.",
    expirable: false,
    defaults: allManagerTiers(),
  },
  {
    key: "PEOPLE_HR_SENSITIVE",
    category: "PEOPLE",
    label: "People: view & edit HR-sensitive info (address, SSN/ITIN)",
    description:
      "View and edit home address and SSN/ITIN. One combined view+edit capability (not split). Masked-by-default with step-up-PIN reveal is a later phase — this flag alone does not yet enforce masking.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },

  // ---- Schedule — resolved 2026-08-18, two-layer approach ----
  {
    key: "SCHEDULE_MANAGE",
    category: "SCHEDULE",
    label: "Schedule: swap requests, manage/edit plan, publish",
    description:
      "Handle swap requests and manage, edit, and publish the schedule. Default ON for Floor Manager/Assistant Manager (and Partner, Admin) — this is their normal day-to-day job; revoke individually for a specific problem account rather than disabling the whole tier.",
    expirable: false,
    defaults: allManagerTiers(),
  },
];

const CAPABILITY_BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));

export function getCapabilityDef(key: string): CapabilityDef | undefined {
  return CAPABILITY_BY_KEY.get(key);
}

export function isValidCapabilityKey(key: string): boolean {
  return CAPABILITY_BY_KEY.has(key);
}

export const CAPABILITY_CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  GENERAL: "General",
  FINANCIAL_AUDITOR: "Financial Auditor (grantable, per-item expiry)",
  TIP_POOL: "Tip Pool Structure",
  PEOPLE: "People",
  SCHEDULE: "Schedule",
};
