import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeForEdit, loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { EmployeeForm } from "../../EmployeeForm";
import { SetPinForm } from "../../SetPinForm";
import { GenerateLoginIdControl } from "../../GenerateLoginIdControl";
import { Card } from "@/components/ui/Card";
import { ChevronDownIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

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
    <main className="max-w-2xl mx-auto p-4 sm:p-8">
      <Link href={`/people/${employee.id}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; {employee.nickname}&apos;s profile
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-6">Edit employee — {employee.nickname}</h1>
      <EmployeeForm
        existing={employee}
        allPositions={allPositions}
        canViewContact={canViewContact}
        canViewHrSensitive={canViewHrSensitive}
      />
      {/* PIN as a collapsible card, same chevron pattern as the form's
          Positions section (2026-08-24, Oliver: "make position and pin as
          card and collapse like others"). Closed by default -- resetting a
          PIN is occasional, and the summary already answers the everyday
          question (set or not). */}
      <Card className="!p-0 overflow-hidden mt-6">
        <details className="group">
          <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 px-4 py-3 min-h-11">
            <span className="text-sm font-semibold text-[var(--ink-900)]">
              Staff login PIN
              <span className="ml-2 text-xs font-normal text-[var(--ink-500)]">{employee.hasPinSet ? "— set" : "— not set"}</span>
            </span>
            <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
          </summary>
          <div className="px-4 pb-4">
            <SetPinForm employeeId={employee.id} hasPinSet={employee.hasPinSet} />
          </div>
        </details>
      </Card>
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
