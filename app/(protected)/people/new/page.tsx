import Link from "next/link";
import { loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { EmployeeForm } from "../EmployeeForm";

export default async function NewEmployeePage() {
  const session = await getCurrentStaffSession();
  const viewerIsAdmin = session?.systemRole === "ADMIN";
  const allPositions = await loadAllPositionsForAssignment();

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/people" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; People
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-6">New employee</h1>
      <EmployeeForm existing={null} allPositions={allPositions} viewerIsAdmin={viewerIsAdmin} />
    </main>
  );
}
