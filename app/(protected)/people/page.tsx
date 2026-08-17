import Link from "next/link";
import { loadEmployeesList } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { PeopleTable } from "./PeopleTable";

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
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">People</h1>
        <Link href="/people/new" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm">
          + New person
        </Link>
      </div>
      <p className="text-neutral-500 text-sm mb-6">
        Create and edit staff — which positions they can work, their standing tip point value, and
        (for BOH) their per-employee wage rate. Retiring someone keeps every past shift they worked
        intact; it just stops offering them when staffing new ones.
      </p>

      {employeeList.length === 0 ? (
        <p className="text-neutral-500 text-sm">No one added yet.</p>
      ) : (
        <PeopleTable employeeList={employeeList} viewerIsAdmin={viewerIsAdmin} />
      )}
    </main>
  );
}
