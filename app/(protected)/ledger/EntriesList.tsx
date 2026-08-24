"use client";

import { useState, useTransition } from "react";
import { deletePettyCashEntry, updatePettyCashEntry } from "@/lib/actions/ledger";
import type { PettyCashEntryView } from "@/lib/ledger/loadPettyCashDay";
import { Banner, Button, ConfirmDialog, EmptyState, Select, TextInput } from "@/components/ui";
import { formatMoney } from "./formatMoney";

type Option = { id: number; name: string };

/** Card list, not a wide table -- these get checked on a phone screen. */
export function EntriesList({
  entries,
  date,
  locked,
  vendors,
  categories,
}: {
  entries: PettyCashEntryView[];
  date: string;
  locked: boolean;
  vendors: Option[];
  categories: Option[];
}) {
  if (entries.length === 0) {
    return (
      <div className="mb-4">
        <EmptyState message="No expenses logged yet today." />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] mb-3 text-sm bg-[var(--card)]">
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} date={date} locked={locked} vendors={vendors} categories={categories} />
      ))}
    </ul>
  );
}

/** 2026-08-21 visual-audit fix: this Remove control used to delete a
 * petty-cash entry outright on a single click of a 24x32px icon button
 * -- no confirmation, no undo, and the deletion is permanent (unlike
 * Retire, which is reversible). Now gated behind ConfirmDialog, naming the
 * exact entry and amount so the manager can see what they're about to
 * delete.
 *
 * 2026-08-22: Edit added, from Oliver's own testing -- "added expense
 * should be able to edit before finalize", and later "editing draft can
 * edit note too". Until now the only way to correct a mistyped amount, or
 * fix a typo in a note, was to delete a money record and re-create it,
 * which silently reassigns who logged it and when. All four fields are
 * editable because the same limitation applied to every one of them. */
function EntryRow({
  entry,
  date,
  locked,
  vendors,
  categories,
}: {
  entry: PettyCashEntryView;
  date: string;
  locked: boolean;
  vendors: Option[];
  categories: Option[];
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState(String(entry.categoryId));
  const [vendorId, setVendorId] = useState(entry.vendorId ? String(entry.vendorId) : "");
  const [note, setNote] = useState(entry.note ?? "");
  const [amount, setAmount] = useState(String(entry.amount));

  function cancel() {
    setCategoryId(String(entry.categoryId));
    setVendorId(entry.vendorId ? String(entry.vendorId) : "");
    setNote(entry.note ?? "");
    setAmount(String(entry.amount));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted to
      // "Minified React error #441" in production (2026-08-24 sweep).
      const result = await updatePettyCashEntry(entry.id, date, {
        categoryId: Number(categoryId),
        vendorId: vendorId === "" ? null : Number(vendorId),
        note: note.trim() || null,
        amount: Number(amount),
      });
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  if (editing) {
    return (
      <li className="px-3 py-3">
        <div className="flex flex-col gap-2.5">
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select label="Vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <TextInput label="Note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          <TextInput
            label="Amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {error && <Banner tone="danger" title={error} />}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={cancel} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={isPending}>
              Save
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-[var(--ink-900)]">
          {entry.categoryName}
          {entry.vendorName && <span className="text-[var(--ink-500)]"> · {entry.vendorName}</span>}
        </div>
        {entry.note && <div className="text-[var(--ink-500)] text-xs mt-0.5">{entry.note}</div>}
        <div className="text-[var(--ink-400)] text-[11px] mt-0.5">by {entry.createdByName}</div>
        {!locked && (
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={isPending}>
              Edit
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
      <span className="font-semibold tabular-nums text-[var(--ink-900)] shrink-0">{formatMoney(entry.amount)}</span>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Remove this expense?"
        description={`${entry.categoryName}${entry.vendorName ? ` · ${entry.vendorName}` : ""} — ${formatMoney(entry.amount)}. This deletes the entry for good and changes today's petty-cash total. It can't be undone.`}
        confirmLabel="Remove"
        loading={isPending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await deletePettyCashEntry(entry.id, date);
            if (result.error) setError(result.error);
            setConfirmOpen(false);
          })
        }
      />
    </li>
  );
}
