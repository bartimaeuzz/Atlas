import { requireAdmin } from "@/lib/auth/guard";
import { loadCapabilityMatrix } from "@/lib/permissions/loadCapabilityMatrix";
import { EmployeeCapabilityCard } from "./EmployeeCapabilityCard";

/** Permission and Roles — Admin-only (2026-08-19, Permission System
 * Phase 1 "Foundation"). See project_atlas_permission_system memory for
 * the full confirmed design. This page manages the STORED capability
 * flags only — no existing server action reads them yet (that's a later,
 * explicitly separate phase; see the schema.ts comment above
 * employeeCapabilities for the full phase breakdown). Toggling something
 * here does not yet change what anyone can actually do in the app. */
export default async function PermissionsPage() {
  await requireAdmin();
  const matrix = await loadCapabilityMatrix();

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Permission and Roles</h1>
      <p className="text-[var(--ink-500)] text-sm mb-2">
        Assign an Account Type preset for the everyday case, or open Advanced to fine-tune individual
        capabilities per person — including per-item expiry for Financial Auditor items.
      </p>
      <div className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] px-3 py-2 text-xs text-[var(--warning-700)] mb-6">
        Foundation build in progress: these settings are stored, but not yet enforced anywhere in the
        app. Enforcing them across every page and action is a separate, upcoming phase.
      </div>

      <div className="space-y-4">
        {matrix.map((employee) => (
          <EmployeeCapabilityCard key={employee.employeeId} employee={employee} />
        ))}
      </div>
    </main>
  );
}
