import Link from "next/link";
import { loadAllPositionsForAssignment } from "@/lib/employees/loadEmployeesList";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { EmployeeForm } from "../EmployeeForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export default async function NewEmployeePage() {
  // Same two capability flags as the edit page (2026-08-23) -- which
  // personal-info fieldsets this account may fill in. On a brand-new
  // person there is nothing to read yet, but the write side of the
  // action checks the same two keys, so offering a field this account
  // cannot save would be a dead end.
  const [viewer, allPositions] = await Promise.all([getViewerCapabilities(), loadAllPositionsForAssignment()]);
  const canViewContact = viewer?.has("PEOPLE_CONTACT_INFO_VIEW") ?? false;
  const canViewHrSensitive = viewer?.has("PEOPLE_HR_SENSITIVE") ?? false;

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/people" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; People
      </Link>
      <h1 className="text-3xl font-bold text-[var(--ink-900)] mt-2 mb-6">New employee</h1>
      <EmployeeForm
        existing={null}
        allPositions={allPositions}
        canViewContact={canViewContact}
        canViewHrSensitive={canViewHrSensitive}
      />
    </main>
  );
}
