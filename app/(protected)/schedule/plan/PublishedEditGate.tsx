"use client";

import { useState } from "react";
import { AutoFillWeekButton } from "./AutoFillWeekButton";
import { WeeklyPlanGrid } from "@/app/schedule/WeeklyPlanGrid";
import type { WeeklyPlanData } from "@/lib/schedule/loadWeeklyPlan";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * "Edit published schedule" gate (2026-08-14, Oliver's own idea): a
 * published week's add/remove controls start LOCKED behind a single
 * "Edit published schedule" button. Restyled onto the design system
 * 2026-08-18 -- the gate banner now carries the tier-2
 * consequence-disclosure treatment (states what happens before the
 * manager commits to editing) via the warning Banner + button copy
 * below, matching the pattern decided in the 2026-08-18 UI review.
 *
 * FIXED 2026-08-18, later same day (Oliver caught this from a live
 * screenshot): the locked state used to return early and hide the
 * WeeklyPlanGrid entirely behind the "Edit published schedule" button --
 * a manager landing on an already-published week saw only a notice card,
 * no schedule. Oliver's own words: a published page "ก็ยังต้องโชว์ตาราง
 * โดยที่มีคำแจ้งเตือนลอยอยู่ข้างบน" (should still show the table, with the
 * notice floating above it, not instead of it). Fixed by always rendering
 * the grid -- read-only while locked (same readOnly mode Preview's own
 * "Staff view" already uses), full quick-add/remove once unlocked -- with
 * the warning notice as a banner above it rather than a full-screen block.
 */
export function PublishedEditGate({
  isPublished,
  data,
  weekId,
  allEmployees,
  employeeAssignedPositionIds,
}: {
  isPublished: boolean;
  data: WeeklyPlanData;
  weekId: number;
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  employeeAssignedPositionIds: Record<number, number[]>;
}) {
  const [unlocked, setUnlocked] = useState(!isPublished);
  // Unlocking now takes a ConfirmDialog (2026-08-24, Oliver's call): the
  // consequence used to live only in the button label, which a manager
  // taps through without reading. The dialog states it as a question the
  // manager has to answer, and focus lands on Cancel (ConfirmDialog's own
  // rule), so a stray Enter dismisses instead of unlocking.
  const [confirming, setConfirming] = useState(false);
  // Collapsed by default (Oliver, 2026-08-25): the full notice measured
  // 310x202px on a phone — a third of the viewport gone before the
  // schedule starts. One compact line stays; the chevron expands the
  // full explanation and the Edit button.
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const locked = isPublished && !unlocked;

  return (
    <>
      {locked ? (
        <Card className="mb-6 !bg-[var(--warning-tint)] !border-[var(--warning-border)] !p-3">
          <button
            type="button"
            onClick={() => setNoticeExpanded((v) => !v)}
            aria-expanded={noticeExpanded}
            className="w-full min-h-11 flex items-center justify-between gap-3 text-left"
          >
            <span className="text-sm font-medium text-[var(--warning-700)]">
              Published — viewing read-only
            </span>
            <span aria-hidden className="text-[var(--warning-700)] shrink-0">
              {noticeExpanded ? "▲" : "▼"}
            </span>
          </button>
          {noticeExpanded && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--warning-700)]">
                Staff can already see this week on their own My Schedule. Removing someone is logged
                automatically, adding someone isn&apos;t.
              </p>
              <Button variant="secondary" className="shrink-0" onClick={() => setConfirming(true)}>
                Edit published schedule
              </Button>
            </div>
          )}
          <ConfirmDialog
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={() => {
              setUnlocked(true);
              setConfirming(false);
            }}
            title="Edit the published schedule?"
            description="Staff can already see this week on their own My Schedule. Anyone you add or remove will see the change right away."
            confirmLabel="Edit schedule"
          />
        </Card>
      ) : (
        isPublished && (
          <div className="mb-3">
            <Banner tone="warning" title="Editing a published week" description="Changes are visible to staff immediately." />
          </div>
        )
      )}

      {/* The "Add to a slot" card that used to sit here was removed
          2026-08-24 (Oliver: duplicate). Every cell in the grid has its own
          QuickAddCell, which is the same addPlannedAssignment action with
          the date/period/position already known -- the standalone form made
          the manager re-pick all three from dropdowns. */}
      {!locked && <AutoFillWeekButton weekId={weekId} />}

      <WeeklyPlanGrid
        data={data}
        weekId={locked ? undefined : weekId}
        allEmployees={allEmployees}
        employeeAssignedPositionIds={employeeAssignedPositionIds}
        readOnly={locked}
      />
    </>
  );
}
