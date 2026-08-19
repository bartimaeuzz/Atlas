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
    label: "Supplier Check: log/print/mark paid",
    description: "Log, print, and mark Supplier Check invoices as paid.",
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
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_LEDGER_CARD_IMPORT",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: import",
    description: "Import Ledger Card transactions.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_LEDGER_CARD_CATEGORIZE",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: categorize",
    description: "Categorize Ledger Card transactions.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
  },
  {
    key: "FA_LEDGER_CARD_RECONCILE",
    category: "FINANCIAL_AUDITOR",
    label: "Ledger Card: reconcile",
    description: "Reconcile the Ledger Card report.",
    expirable: true,
    defaults: { ...ALL_FALSE, ADMIN: true },
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
    label: "Supplier Check: finalize",
    description: "Finalize Supplier Check invoices.",
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
