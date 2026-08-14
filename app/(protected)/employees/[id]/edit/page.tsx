import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeForEdit, loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { EmployeeForm } from "../../EmployeeForm";
import { SetPinForm } from "../../SetPinForm";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [employee, allPositions] = await Promise.all([
    loadEmployeeForEdit(Number(id)),
    loadAllPositionsForAssignment(),
  ]);

  if (!employee) notFound();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/employees" className="text-neutral-500 hover:underline">← Employees</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">Edit employee — {employee.name}</h1>
      <EmployeeForm existing={employee} allPositions={allPositions} />
      <div className="mt-6">
        <SetPinForm employeeId={employee.id} hasPinSet={employee.hasPinSet} />
      </div>
    </main>
  );
}
