"use client";

import { useTransition } from "react";
import { deletePettyCashEntry } from "@/lib/actions/ledger";
import type { PettyCashEntryView } from "@/lib/ledger/loadPettyCashDay";

/** Card list, not a wide table -- these get checked on a phone screen. */
export function EntriesList({ entries, date, locked }: { entries: PettyCashEntryView[]; date: string; locked: boolean }) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-400 border rounded p-3 mb-4">No expenses logged yet today.</p>;
  }

  return (
    <ul className="divide-y border rounded mb-4 text-sm">
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
        <div className="font-medium">
          {entry.categoryName}
          {entry.vendorName && <span className="text-neutral-500"> · {entry.vendorName}</span>}
        </div>
        {entry.note && <div className="text-neutral-500 text-xs mt-0.5">{entry.note}</div>}
        <div className="text-neutral-400 text-[11px] mt-0.5">by {entry.createdByName}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-medium">${entry.amount.toFixed(2)}</span>
        {!locked && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => deletePettyCashEntry(entry.id, date))}
            className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
            aria-label={`Remove ${entry.categoryName} entry`}
          >
            &times;
          </button>
        )}
      </div>
    </li>
  );
}
