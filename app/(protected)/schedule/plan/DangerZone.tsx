"use client";

import { useActionState, useState } from "react";
import { clearDay, deleteWeek, type DangerZoneActionState } from "@/lib/actions/schedule";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { AlertTriangleIcon } from "@/components/ui/icons";

const initialState: DangerZoneActionState = { error: null };

/**
 * "Delete draft day" / "Delete draft week" (2026-08-14, Oliver) --
 * start-over controls for a week's plan. Kept as a collapsed <details>
 * disclosure rather than always-visible buttons, since this is a
 * destructive, infrequent action -- restyled onto the design system's
 * danger tokens 2026-08-18, still deliberately collapsible (the
 * DangerZoneSection component is always-visible, which doesn't fit this
 * one's "tucked away until needed" intent, so this restyles the same
 * color language by hand rather than swapping components).
 *
 * 2026-08-14 follow-up, same conversation: no PIN here anymore --
 * Oliver decided a PIN doesn't add much for a small restaurant where
 * one manager often does everything ("pin might not be the answer").
 * Replaced with typing the literal confirm word (CLEAR / DELETE) --
 * friction against a misclick, explicitly NOT meant to catch a bad
 * actor. A reason is required ONLY when the day/week being touched is
 * already published -- drafts don't need one. Every action is logged
 * either way (see ChangeLogPanel below and the staff-facing view on
 * /me/schedule) so there's a record even without a PIN gate.
 */
export function DangerZone({
  weekId,
  dates,
  status,
  totalAssignments,
}: {
  weekId: number;
  dates: string[];
  status: "draft" | "published";
  totalAssignments: number;
}) {
  const [clearState, clearAction, clearPending] = useActionState(clearDay, initialState);
  const [deleteState, deleteActionFn, deletePending] = useActionState(deleteWeek, initialState);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");

  const isPublished = status === "published";

  return (
    <details className="mt-8 border border-[var(--danger-border)] rounded-[var(--radius-lg)] bg-[var(--danger-tint)]">
      <summary className="cursor-pointer flex items-center gap-2 text-sm font-semibold text-[var(--danger-700)] px-4 py-3">
        <AlertTriangleIcon width={16} height={16} />
        Danger zone — clear a day or start this week over
      </summary>
      <div className="px-4 pb-4 space-y-5">
        {isPublished && (
          <Banner
            tone="danger"
            title="This week is PUBLISHED"
            description="Staff can already see it on their own My Schedule. Anything you clear or delete here disappears from their view immediately. A reason is required below."
          />
        )}

        <form action={clearAction} className="space-y-2 border-t border-[var(--danger-border)] pt-4">
          <p className="text-xs text-[var(--danger-700)]">
            <strong>Clear a day</strong> — removes every assignment (any position, Lunch &amp; Dinner)
            for the date you pick, for this week only. The rest of the week is untouched. Cannot be
            undone.
          </p>
          <input type="hidden" name="weekId" value={weekId} />
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <Select
              name="date"
              required
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="!w-auto"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <TextInput type="text" name="confirmWord" placeholder="Type CLEAR to confirm" required className="!w-44" />
            <Button type="submit" variant="destructive" size="sm" loading={clearPending}>
              {clearPending ? "Clearing…" : "Clear this day"}
            </Button>
          </div>
          {isPublished && (
            <TextInput type="text" name="reason" placeholder="Reason (required — this day is published)" required />
          )}
          {clearState.error && <p className="text-xs text-[var(--danger-700)]">{clearState.error}</p>}
        </form>

        <form action={deleteActionFn} className="space-y-2 border-t border-[var(--danger-border)] pt-4">
          <p className="text-xs text-[var(--danger-700)]">
            <strong>Delete this whole week</strong> — removes all {totalAssignments} assignment
            {totalAssignments === 1 ? "" : "s"} in this week and resets it to &quot;Not planned,&quot;
            as if you never clicked &quot;Generate from template.&quot; Cannot be undone.
          </p>
          <input type="hidden" name="weekId" value={weekId} />
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <TextInput type="text" name="confirmWord" placeholder="Type DELETE to confirm" required className="!w-44" />
            <Button type="submit" variant="destructive" size="sm" loading={deletePending}>
              {deletePending ? "Deleting…" : "Delete this week"}
            </Button>
          </div>
          {isPublished && (
            <TextInput type="text" name="reason" placeholder="Reason (required — this week is published)" required />
          )}
          {deleteState.error && <p className="text-xs text-[var(--danger-700)]">{deleteState.error}</p>}
        </form>
      </div>
    </details>
  );
}
