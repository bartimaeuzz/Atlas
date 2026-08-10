import Link from "next/link";
import { loadEmployeesList } from "@/lib/employees/loadEmployeesList";
import { EmployeeToggleActiveButton } from "./EmployeeToggleActiveButton";

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
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Primary position</th>
              <th className="py-2">Positions</th>
              <th className="py-2">Role</th>
              <th className="py-2"></th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {employeeList.map((e) => (
              <tr key={e.id} className={"border-b" + (e.active ? "" : " opacity-50")}>
                <td className="py-2">
                  {e.name}
                  {!e.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
                </td>
                <td className="py-2 text-neutral-500">{e.primaryPositionName ?? "—"}</td>
                <td className="py-2 text-neutral-500">
                  {e.positions.length === 0 ? "—" : e.positions.map((p) => p.positionName).join(", ")}
                </td>
                <td className="py-2 text-neutral-500">{e.systemRole}</td>
                <td className="py-2 text-right">
                  <Link href={`/employees/${e.id}/edit`} className="underline text-blue-600">
                    Edit
                  </Link>
                </td>
                <td className="py-2 text-right">
                  <EmployeeToggleActiveButton employeeId={e.id} active={e.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
