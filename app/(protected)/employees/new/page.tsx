import Link from "next/link";
import { loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { EmployeeForm } from "../EmployeeForm";

export default async function NewEmployeePage() {
  const allPositions = await loadAllPositionsForAssignment();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/employees" className="text-neutral-500 hover:underline">← Employees</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">New employee</h1>
      <EmployeeForm existing={null} allPositions={allPositions} />
    </main>
  );
}
