import { loadEmployeesList } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { PeopleTable } from "./PeopleTable";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";

/** Renamed from "Employees" to "People" (2026-08-17, Oliver). Route moved
 * from /employees to /people — old URL still resolves via the redirect
 * page at app/(protected)/employees/page.tsx. The underlying data model
 * (the `employees` table, loaders, actions) keeps its existing name —
 * this rename is UI-facing only, same reasoning `nickname` used when it
 * kept its DB column name after being aliased everywhere else. */
export default async function PeopleListPage() {
  const [employeeList, session] = await Promise.all([loadEmployeesList(), getCurrentStaffSession()]);
  const viewerIsAdmin = session?.systemRole === "ADMIN";

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8">
      <PageHeader
        title="People"
        description="Create and edit staff — which positions they can work, their standing tip point value, and (for BOH) their per-employee wage rate. Retiring someone keeps every past shift they worked intact; it just stops offering them when staffing new ones."
        actions={<LinkButton href="/people/new">+ New person</LinkButton>}
      />

      {/* Headcount at a glance (2026-08-31, Aey: "add widget dashboard on
          /people show how many staff we have. active/deactivate or
          retire"). Employees have exactly one lifecycle flag — active vs
          retired — so the honest widget is those two plus the total, not
          an invented third state. Computed from the same rows the table
          below renders, so the numbers can never disagree with the list. */}
      {employeeList.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
          {[
            { label: "Total people", value: employeeList.length },
            { label: "Active", value: employeeList.filter((e) => e.active).length },
            { label: "Retired", value: employeeList.filter((e) => !e.active).length },
          ].map((t) => (
            <div key={t.label} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
              <div className="text-2xl font-semibold tabular-nums text-[var(--ink-900)]">{t.value}</div>
              <div className="text-xs text-[var(--ink-500)]">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {employeeList.length === 0 ? (
        <EmptyState message="No one added yet." />
      ) : (
        <PeopleTable employeeList={employeeList} viewerIsAdmin={viewerIsAdmin} />
      )}
    </main>
  );
}
