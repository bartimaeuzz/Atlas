import Link from "next/link";
import { loadTemplatesByPosition } from "@/lib/schedule/loadTemplatesByPosition";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { Banner } from "@/components/ui/Banner";
import { PositionTemplateGrid } from "./PositionTemplateGrid";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export default async function ScheduleTemplatesPage() {
  const [groups, canManage] = await Promise.all([loadTemplatesByPosition(), hasCapability("SCHEDULE_MANAGE")]);

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/schedule" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Template assignments</h1>
      <p className="text-[var(--ink-500)] text-sm mb-6">
        Who normally works which position — the recurring baseline a week&apos;s plan will be
        pre-filled from. Pick a position, pick a person, then check off the days and shifts they
        work. This is a fixed default: it only changes when you tell it to (a resignation, a
        promotion, a sales-driven staffing change), not automatically every week.
      </p>

      {groups.length === 0 ? (
        <p className="text-[var(--ink-500)] text-sm">Add active positions first.</p>
      ) : canManage ? (
        <PositionTemplateGrid groups={groups} />
      ) : (
        // View-only (2026-08-24): PositionTemplateGrid's controls are all
        // form elements (inputs/selects/buttons), so fieldset-disabled
        // covers every one — no links or drag handlers survive it.
        <>
          <div className="mb-4">
            <Banner
              tone="info"
              title="View only"
              description="Changing template assignments is done by whoever holds the schedule-management permission."
            />
          </div>
          {/* Same disabled-look treatment as /schedule/targets — see the
              comment there. */}
          <fieldset
            disabled
            className="[&_button]:opacity-50 [&_input]:opacity-50 [&_select]:opacity-50 [&_button]:cursor-not-allowed"
          >
            <PositionTemplateGrid groups={groups} />
          </fieldset>
        </>
      )}
    </main>
  );
}
