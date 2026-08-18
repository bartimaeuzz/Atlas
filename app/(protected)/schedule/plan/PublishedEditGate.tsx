"use client";

import { useState } from "react";
import { AddPlannedAssignmentForm } from "./AddPlannedAssignmentForm";
import { AutoFillWeekButton } from "./AutoFillWeekButton";
import { WeeklyPlanGrid } from "@/app/schedule/WeeklyPlanGrid";
import type { WeeklyPlanData } from "@/lib/schedule/loadWeeklyPlan";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

/**
 * "Edit published schedule" gate (2026-08-14, Oliver's own idea): a
 * published week's add/remove controls start LOCKED behind a single
 * "Edit published schedule" button. Restyled onto the design system
 * 2026-08-18 -- the gate banner now carries the tier-2
 * consequence-disclosure treatment (states what happens before the
 * manager commits to editing) via the warning Banner + button copy
 * below, matching the pattern decided in the 2026-08-18 UI review.
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
      <Card className="mb-8 flex flex-wrap items-center justify-between gap-4 !bg-[var(--warning-tint)] !border-[var(--warning-border)]">
        <p className="text-sm text-[var(--warning-700)]">
          This week is published — staff can already see it on their own My Schedule. Removing
          someone is logged automatically; adding someone isn&apos;t.
        </p>
        <Button variant="secondary" className="shrink-0" onClick={() => setUnlocked(true)}>
          Edit published schedule (changes are visible to staff right away)
        </Button>
      </Card>
    );
  }

  return (
    <>
      {isPublished && (
        <div className="mb-3">
          <Banner tone="warning" title="Editing a published week" description="Changes are visible to staff immediately." />
        </div>
      )}

      <AutoFillWeekButton weekId={weekId} />

      <Card className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--ink-900)] mb-3">Add to a slot</h2>
        {allEmployees.length === 0 || allPositions.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)]">Add active employees and positions first.</p>
        ) : (
          <AddPlannedAssignmentForm
            weekId={weekId}
            dates={data.dates}
            allEmployees={allEmployees}
            allPositions={allPositions}
            employeeAssignedPositionIds={employeeAssignedPositionIds}
          />
        )}
      </Card>

      <WeeklyPlanGrid
        data={data}
        weekId={weekId}
        allEmployees={allEmployees}
        employeeAssignedPositionIds={employeeAssignedPositionIds}
      />
    </>
  );
}
