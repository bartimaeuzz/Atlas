import Link from "next/link";
import { loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { EmployeeForm } from "../EmployeeForm";

export default async function NewEmployeePage() {
  const session = await getCurrentStaffSession();
  const viewerIsAdmin = session?.systemRole === "ADMIN";
  const allPositions = await loadAllPositionsForAssignment();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/people" className="text-neutral-500 hover:underline">← People</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">New employee</h1>
      <EmployeeForm existing={null} allPositions={allPositions} viewerIsAdmin={viewerIsAdmin} />
    </main>
  );
}
