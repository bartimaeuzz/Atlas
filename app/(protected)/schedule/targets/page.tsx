import Link from "next/link";
import { loadStaffingTargets } from "@/lib/schedule/loadStaffingTargets";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { Banner } from "@/components/ui/Banner";
import { TargetsForm } from "./TargetsForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export default async function StaffingTargetsPage() {
  const [data, canManage] = await Promise.all([loadStaffingTargets(), hasCapability("SCHEDULE_MANAGE")]);

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/schedule" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Staffing targets</h1>
      <p className="text-[var(--ink-500)] text-sm mb-6">
        How many people you need in each position, by day of week and period. This is the
        baseline the weekly schedule grid uses to flag under-staffed days at a glance. Leave a
        cell blank or 0 if you don&apos;t normally staff that position that day/period. Each
        position gets a Lunch row and a Dinner row — use the &quot;All days&quot; +/- to bump
        every day in a row at once, or the per-day +/- to fine-tune a single cell.
      </p>

      {data.positions.length === 0 ? (
        <p className="text-[var(--ink-500)] text-sm">No active positions yet — add some in Positions first.</p>
      ) : canManage ? (
        <TargetsForm positions={data.positions} targets={data.targets} />
      ) : (
        // View-only (2026-08-24): every control inside TargetsForm is a
        // form element (buttons/inputs), so fieldset-disabled genuinely
        // covers all of them — no links or drag handlers survive it.
        <>
          <div className="mb-4">
            <Banner
              tone="info"
              title="View only"
              description="Changing staffing targets is done by whoever holds the schedule-management permission."
            />
          </div>
          {/* The opacity classes exist because TargetsForm's own +/- buttons
              have no disabled: styling — without this, an inert control keeps
              its full active look and silently ignores taps (2026-08-25 audit
              finding: affordance must not lie to a low-literacy user). */}
          <fieldset
            disabled
            className="[&_button]:opacity-50 [&_input]:opacity-50 [&_select]:opacity-50 [&_button]:cursor-not-allowed"
          >
            <TargetsForm positions={data.positions} targets={data.targets} />
          </fieldset>
        </>
      )}
    </main>
  );
}
