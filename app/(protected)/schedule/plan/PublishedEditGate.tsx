"use client";

import { useState } from "react";
import { AddPlannedAssignmentForm } from "./AddPlannedAssignmentForm";
import { WeeklyPlanGrid } from "./WeeklyPlanGrid";
import type { WeeklyPlanData } from "@/lib/schedule/loadWeeklyPlan";

/**
 * "Edit published schedule" gate (2026-08-14, Oliver's own idea,
 * raised right after the Nancy-log gap above): a published week's
 * add/remove controls now start LOCKED (grid rendered readOnly, no
 * "Add to a slot" form) behind a single "Edit published schedule"
 * button. Clicking it reveals the normal editable controls for the
 * rest of this page view.
 *
 * Deliberately a client-side, per-visit toggle rather than a stored
 * flag or a second confirmation dialog per edit -- same "friction, not
 * a lock" philosophy as the danger zone's typed-word confirm: it
 * doesn't stop anyone, it makes sure a manager consciously chooses to
 * start editing a schedule staff can already see, instead of
 * discovering that fact only after they've already clicked something.
 * Resets every time this page is loaded/reloaded -- there's no
 * "remember my choice," on purpose.
 *
 * DRAFT weeks skip the gate entirely (start unlocked) -- nobody
 * outside management can see a draft, so there's nothing to be
 * deliberate about yet.
 */
export function PublishedEditGate({
  isPublished,
  data,
  weekId,
  allEmployees,
  allPositions,
  employeeAssignedPositionIds,
}: {
  isPublished: boolean;
  data: WeeklyPlanData;
  weekId: number;
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  allPositions: { id: number; name: string; category: "FOH" | "BOH" }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const [unlocked, setUnlocked] = useState(!isPublished);

  if (isPublished && !unlocked) {
    return (
      <div className="mb-8 border border-amber-200 bg-amber-50 rounded p-4 flex items-center justify-between gap-4">
        <p className="text-sm text-amber-800">
          This week is published — staff can already see it on their own My Schedule. Removing
          someone is logged automatically; adding someone isn&apos;t.
        </p>
        <button
          onClick={() => setUnlocked(true)}
          className="bg-black text-white px-4 py-1.5 rounded text-sm hover:bg-neutral-800 shrink-0"
        >
          Edit published schedule
        </button>
      </div>
    );
  }

  return (
    <>
      {isPublished && (
        <p className="text-xs text-amber-700 mb-3">
          Editing a published week — changes are visible to staff immediately.
        </p>
      )}

      <div className="mb-8 border rounded p-4 bg-neutral-50">
        <h2 className="font-medium mb-3 text-sm">Add to a slot</h2>
        {allEmployees.length === 0 || allPositions.length === 0 ? (
          <p className="text-sm text-neutral-500">Add active employees and positions first.</p>
        ) : (
          <AddPlannedAssignmentForm
            weekId={weekId}
            dates={data.dates}
            allEmployees={allEmployees}
            allPositions={allPositions}
            employeeAssignedPositionIds={employeeAssignedPositionIds}
          />
        )}
      </div>

      <WeeklyPlanGrid
        data={data}
        weekId={weekId}
        allEmployees={allEmployees}
        employeeAssignedPositionIds={employeeAssignedPositionIds}
      />
    </>
  );
}
