"use client";

import { useActionState, useState } from "react";
import { clearDay, deleteWeek, type DangerZoneActionState } from "@/lib/actions/schedule";

const initialState: DangerZoneActionState = { error: null };

/**
 * "Delete draft day" / "Delete draft week" (2026-08-14, Oliver) --
 * start-over controls for a week's plan. Kept as a collapsed <details>
 * disclosure rather than always-visible buttons, since this is a
 * destructive, infrequent action.
 *
 * 2026-08-14 follow-up, same conversation: no PIN here anymore --
 * Oliver decided a PIN doesn't add much for a small restaurant where
 * one manager often does everything ("pin might not be the answer").
 * Replaced with typing the literal confirm word (CLEAR / DELETE) --
 * friction against a misclick, explicitly NOT meant to catch a bad
 * actor (his words: "works too as a friction but not catching
 * cheat," and that trade-off was fine with him). A reason is required
 * ONLY when the day/week being touched is already published --
 * drafts don't need one. Every action is logged either way (see
 * ChangeLogPanel below and the staff-facing view on /me/schedule) so
 * there's a record even without a PIN gate.
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
    <details className="mt-8 border border-red-200 rounded bg-red-50/40">
      <summary className="cursor-pointer text-sm font-medium text-red-800 px-4 py-3">
        Danger zone — clear a day or start this week over
      </summary>
      <div className="px-4 pb-4 space-y-5">
        {isPublished && (
          <p className="text-xs font-medium text-red-800 bg-red-100 border border-red-300 rounded px-2 py-1.5">
            ⚠ This week is PUBLISHED — staff can already see it on their own My Schedule. Anything you
            clear or delete here disappears from their view immediately. A reason is required below.
          </p>
        )}

        <form action={clearAction} className="space-y-2 border-t border-red-200 pt-4">
          <p className="text-xs text-red-700">
            <strong>Clear a day</strong> — removes every assignment (any position, Lunch &amp; Dinner)
            for the date you pick, for this week only. The rest of the week is untouched. Cannot be
            undone.
          </p>
          <input type="hidden" name="weekId" value={weekId} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              name="date"
              required
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border rounded px-2 py-1"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="confirmWord"
              placeholder='Type CLEAR to confirm'
              required
              className="border rounded px-2 py-1 w-40"
            />
            <button
              type="submit"
              disabled={clearPending}
              className="bg-red-600 text-white px-3 py-1.5 rounded text-xs hover:bg-red-700 disabled:opacity-50"
            >
              {clearPending ? "Clearing…" : "Clear this day"}
            </button>
          </div>
          {isPublished && (
            <input
              type="text"
              name="reason"
              placeholder="Reason (required — this day is published)"
              required
              className="border rounded px-2 py-1 text-sm w-full"
            />
          )}
          {clearState.error && <p className="text-xs text-red-700">{clearState.error}</p>}
        </form>

        <form action={deleteActionFn} className="space-y-2 border-t border-red-200 pt-4">
          <p className="text-xs text-red-700">
            <strong>Delete this whole week</strong> — removes all {totalAssignments} assignment
            {totalAssignments === 1 ? "" : "s"} in this week and resets it to &quot;Not planned,&quot;
            as if you never clicked &quot;Generate from template.&quot; Cannot be undone.
          </p>
          <input type="hidden" name="weekId" value={weekId} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="text"
              name="confirmWord"
              placeholder='Type DELETE to confirm'
              required
              className="border rounded px-2 py-1 w-40"
            />
            <button
              type="submit"
              disabled={deletePending}
              className="bg-red-700 text-white px-3 py-1.5 rounded text-xs hover:bg-red-800 disabled:opacity-50"
            >
              {deletePending ? "Deleting…" : "Delete this week"}
            </button>
          </div>
          {isPublished && (
            <input
              type="text"
              name="reason"
              placeholder="Reason (required — this week is published)"
              required
              className="border rounded px-2 py-1 text-sm w-full"
            />
          )}
          {deleteState.error && <p className="text-xs text-red-700">{deleteState.error}</p>}
        </form>
      </div>
    </details>
  );
}
