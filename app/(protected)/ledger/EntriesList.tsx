"use client";

import { useState, useTransition } from "react";
import { deletePettyCashEntry } from "@/lib/actions/ledger";
import type { PettyCashEntryView } from "@/lib/ledger/loadPettyCashDay";
import { EmptyState } from "@/components/ui/Card";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "./formatMoney";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Card list, not a wide table -- these get checked on a phone screen. */
export function EntriesList({ entries, date, locked }: { entries: PettyCashEntryView[]; date: string; locked: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="mb-4">
        <EmptyState message="No expenses logged yet today." />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] mb-4 text-sm bg-[var(--card)]">
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} date={date} locked={locked} />
      ))}
    </ul>
  );
}

/** 2026-08-21 visual-audit fix: this Remove control used to delete a
 * petty-cash entry outright on a single click of a 24x32px icon button
 * -- no confirmation, no undo, and the deletion is permanent (unlike
 * Retire, which is reversible). Same instant-fire-no-confirmation gap
 * found on People's Retire button earlier the same day, but a strictly
 * worse instance: this one removes a money record. Now gated behind
 * ConfirmDialog, naming the exact entry and amount so the manager can
 * see what they're about to delete. */
function EntryRow({ entry, date, locked }: { entry: PettyCashEntryView; date: string; locked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-2">
      <div>
        <div className="font-medium text-[var(--ink-900)]">
          {entry.categoryName}
          {entry.vendorName && <span className="text-[var(--ink-500)]"> · {entry.vendorName}</span>}
        </div>
        {entry.note && <div className="text-[var(--ink-500)] text-xs mt-0.5">{entry.note}</div>}
        <div className="text-[var(--ink-500)] opacity-75 text-[11px] mt-0.5">by {entry.createdByName}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-medium tabular-nums text-[var(--ink-900)]">{formatMoney(entry.amount)}</span>
        {!locked && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
            className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
            aria-label={`Remove ${entry.categoryName} entry`}
          >
            <XIcon width={16} height={16} />
          </button>
        )}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Remove this expense?"
          description={`${entry.categoryName}${entry.vendorName ? ` · ${entry.vendorName}` : ""} — ${formatMoney(entry.amount)}. This deletes the entry for good and changes today's petty-cash total. It can't be undone.`}
          confirmLabel="Remove"
          loading={isPending}
          onConfirm={() =>
            startTransition(async () => {
              await deletePettyCashEntry(entry.id, date);
              setConfirmOpen(false);
            })
          }
        />
      </div>
    </li>
  );
}
