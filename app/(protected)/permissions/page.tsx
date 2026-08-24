import { getCurrentStaffSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { loadCapabilityMatrix } from "@/lib/permissions/loadCapabilityMatrix";
import { RoleGroupCard } from "./RoleGroupCard";
import type { SystemRole } from "@/lib/format/formatSystemRole";

/** Permission and Roles — Admin-only (2026-08-19, Permission System
 * Phase 1 "Foundation"). See project_atlas_permission_system memory for
 * the full confirmed design. This page manages the STORED capability
 * flags only — no existing server action reads them yet (that's a later,
 * explicitly separate phase; see the schema.ts comment above
 * employeeCapabilities for the full phase breakdown). Toggling something
 * here does not yet change what anyone can actually do in the app. */
const ROLE_ORDER: SystemRole[] = ["ADMIN", "MANAGER", "STAFF"];

export default async function PermissionsPage() {
  // 2026-08-21 (Phase C): was requireAdmin(), which redirected a
  // non-Admin to /people with no explanation. Now shows the same plain
  // no-access notice every other capability-gated page shows, so
  // "you don't have this" looks the same everywhere in the app instead
  // of silently teleporting you. An anonymous visitor still goes to
  // /login -- that IS the right destination for someone with no session,
  // and the (protected) layout's requireManager() has already sent them
  // there before this runs.
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");
  if (session.systemRole !== "ADMIN") return <NoAccess pageLabel="Permission and Roles" />;
  const matrix = await loadCapabilityMatrix();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Permission and Roles</h1>
      <p className="text-[var(--ink-500)] text-sm mb-2">
        Assign an Account Type preset for the everyday case, or open Advanced to fine-tune individual
        capabilities per person — including per-item expiry for Financial Auditor items.
      </p>
      {/* 2026-08-21: the old copy here said these settings were stored
          but "not yet enforced anywhere in the app". That stopped being
          true across Phases A/B/B2/C -- 7 server actions and 5 pages now
          enforce these. Left as an honest scope note rather than deleted,
          since a handful of Financial Auditor items genuinely still
          aren't wired (see project_atlas_permission_system memory). */}
      <div className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] px-3 py-2 text-xs text-[var(--warning-700)] mb-6">
        Most of these are live: turning one off now really does hide a page or block an action. A few
        Financial Auditor items are still being wired up and don&apos;t change anything yet.
      </div>

      {/* Grouped by role rather than one flat card per person
          (2026-08-23). Admin first, Staff last and collapsed: that is the
          order an Admin actually looks for someone in, and Staff is most
          of the roster. */}
      <div className="space-y-4">
        {ROLE_ORDER.map((role) => (
          <RoleGroupCard
            key={role}
            role={role}
            employees={matrix.filter((e) => e.systemRole === role)}
            defaultOpen={role !== "STAFF"}
          />
        ))}
      </div>
    </main>
  );
}
