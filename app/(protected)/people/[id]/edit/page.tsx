import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeForEdit, loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { EmployeeForm } from "../../EmployeeForm";
import { SetPinForm } from "../../SetPinForm";
import { GenerateLoginIdControl } from "../../GenerateLoginIdControl";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, viewer] = await Promise.all([getCurrentStaffSession(), getViewerCapabilities()]);
  const viewerIsAdmin = session?.systemRole === "ADMIN";
  // Personal info reads through the capability registry, not systemRole
  // (2026-08-23) -- so granting a manager the HR tier on /permissions
  // works without a deploy. viewerIsAdmin below is a different question
  // (login-ID generation) and is deliberately left alone.
  const canViewContact = viewer?.has("PEOPLE_CONTACT_INFO_VIEW") ?? false;
  const canViewHrSensitive = viewer?.has("PEOPLE_HR_SENSITIVE") ?? false;

  const [employee, allPositions] = await Promise.all([
    loadEmployeeForEdit(Number(id), { canViewContact, canViewHrSensitive }),
    loadAllPositionsForAssignment(),
  ]);

  if (!employee) notFound();

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/people" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; People
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-6">Edit employee — {employee.nickname}</h1>
      <EmployeeForm
        existing={employee}
        allPositions={allPositions}
        canViewContact={canViewContact}
        canViewHrSensitive={canViewHrSensitive}
      />
      <div className="mt-6">
        <SetPinForm employeeId={employee.id} hasPinSet={employee.hasPinSet} />
      </div>
      <div className="mt-6 text-sm">
        <span className="block text-[var(--ink-500)] mb-1">Login ID</span>
        <GenerateLoginIdControl
          employeeId={employee.id}
          loginId={employee.loginId}
          isPartner={employee.isPartner}
          primaryPositionCategory={
            employee.positions.find((p) => p.positionId === employee.primaryPositionId)?.positionCategory ?? null
          }
          viewerIsAdmin={viewerIsAdmin}
        />
      </div>
    </main>
  );
}
