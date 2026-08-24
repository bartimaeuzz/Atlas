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
        actions={<LinkButton href="/people/new" size="sm">+ New person</LinkButton>}
      />

      {employeeList.length === 0 ? (
        <EmptyState message="No one added yet." />
      ) : (
        <PeopleTable employeeList={employeeList} viewerIsAdmin={viewerIsAdmin} />
      )}
    </main>
  );
}
