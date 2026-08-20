"use client";

import { useTransition } from "react";
import { deletePettyCashEntry } from "@/lib/actions/ledger";
import type { PettyCashEntryView } from "@/lib/ledger/loadPettyCashDay";
import { EmptyState } from "@/components/ui/Card";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "./formatMoney";

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

function EntryRow({ entry, date, locked }: { entry: PettyCashEntryView; date: string; locked: boolean }) {
  const [isPending, startTransition] = useTransition();

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
            onClick={() => startTransition(() => deletePettyCashEntry(entry.id, date))}
            className={`text-[var(--ink-500)] hover:text-[var(--danger)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
            aria-label={`Remove ${entry.categoryName} entry`}
          >
            <XIcon width={16} height={16} />
          </button>
        )}
      </div>
    </li>
  );
}
