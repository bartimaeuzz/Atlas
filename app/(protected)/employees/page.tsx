import Link from "next/link";
import { loadEmployeesList } from "@/lib/employees/loadEmployeesList";
import { EmployeesTable } from "./EmployeesTable";

export default async function EmployeesListPage() {
  const employeeList = await loadEmployeesList();

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <Link href="/employees/new" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm">
          + New employee
        </Link>
      </div>
      <p className="text-neutral-500 text-sm mb-6">
        Create and edit staff — which positions they can work, their standing tip point value, and
        (for BOH) their per-employee wage rate. Retiring someone keeps every past shift they worked
        intact; it just stops offering them when staffing new ones.
      </p>

      {employeeList.length === 0 ? (
        <p className="text-neutral-500 text-sm">No employees yet.</p>
      ) : (
        <EmployeesTable employeeList={employeeList} />
      )}
    </main>
  );
}
