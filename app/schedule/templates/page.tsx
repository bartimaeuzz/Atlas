import Link from "next/link";
import { loadScheduleTemplates } from "@/lib/schedule/loadScheduleTemplates";
import { loadEmployeesList, loadAllPositionsForAssignment, loadEmployeeAssignedPositionIds } from "@/lib/employees/loadEmployeesList";
import { AddTemplateForm } from "./AddTemplateForm";
import { TemplatesTable } from "./TemplatesTable";

export default async function ScheduleTemplatesPage() {
  const [templates, employeeList, allPositions, employeeAssignedPositionIds] = await Promise.all([
    loadScheduleTemplates(),
    loadEmployeesList(),
    loadAllPositionsForAssignment(),
    loadEmployeeAssignedPositionIds(),
  ]);

  const activeEmployees = employeeList
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: e.name, primaryPositionId: e.primaryPositionId }));
  const activePositions = allPositions.filter((p) => p.active);

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Template assignments</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Who normally works which position, day of week, and period — the recurring baseline a
        week&apos;s plan will be pre-filled from. This is a fixed default: it only changes when
        you tell it to (a resignation, a promotion, a sales-driven staffing change), not
        automatically every week.
      </p>

      <div className="mb-8 border rounded p-4 bg-neutral-50">
        <h2 className="font-medium mb-3 text-sm">Add assignment</h2>
        {activeEmployees.length === 0 || activePositions.length === 0 ? (
          <p className="text-sm text-neutral-500">Add active employees and positions first.</p>
        ) : (
          <AddTemplateForm
            allEmployees={activeEmployees}
            allPositions={activePositions}
            employeeAssignedPositionIds={employeeAssignedPositionIds}
          />
        )}
      </div>

      {templates.length === 0 ? (
        <p className="text-neutral-500 text-sm">No template assignments yet.</p>
      ) : (
        <TemplatesTable templates={templates} />
      )}
    </main>
  );
}
