"use client";

import { Select, TextInput } from "@/components/ui/Field";
import { XIcon } from "@/components/ui/icons";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { formatMoney } from "../formatMoney";

/** Shared parts editor for splitting one statement line across
 * categories (2026-08-25) -- used by both the entry-time split in
 * AddTransactionForm and the split-existing-row dialog. Amounts live as
 * STRINGS in state on purpose: parsing on every keystroke (the
 * `Number(e.target.value) || 0` pattern) clobbers in-progress input like
 * "12." -- parse at the math/submit boundary instead. */

export interface EditablePart {
  categoryId: number | "";
  amount: string;
  memo: string;
}

export const emptyPart = (): EditablePart => ({ categoryId: "", amount: "", memo: "" });

const toCents = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** Sum of the parseable amounts, in cents. */
export function partsSumCents(parts: EditablePart[]): number {
  return parts.reduce((acc, p) => acc + (toCents(p.amount) ?? 0), 0);
}

/** Every part has a category and a nonzero parseable amount. */
export function partsComplete(parts: EditablePart[]): boolean {
  return parts.every((p) => p.categoryId !== "" && (toCents(p.amount) ?? 0) !== 0);
}

export function SplitPartsEditor({
  parts,
  onChange,
  categories,
  targetAmount,
}: {
  parts: EditablePart[];
  onChange: (next: EditablePart[]) => void;
  categories: { id: number; name: string }[];
  /** When set (splitting an existing line), the live remainder math is
   * shown against this total; a new part prefills with the remainder. */
  targetAmount: number | null;
}) {
  const sumCents = partsSumCents(parts);
  const targetCents = targetAmount != null ? Math.round(targetAmount * 100) : null;
  const remainderCents = targetCents != null ? targetCents - sumCents : null;

  const setPart = (i: number, patch: Partial<EditablePart>) => {
    onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };

  return (
    <div className="space-y-3">
      {parts.map((part, i) => (
        <div key={i} className="rounded-[var(--radius-md)] border border-[var(--border)] p-2 space-y-2">
          <div className="flex items-start gap-2">
            <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
              <Select
                label={`Part ${i + 1} category`}
                required
                value={part.categoryId}
                onChange={(e) => setPart(i, { categoryId: e.target.value ? Number(e.target.value) : "" })}
              >
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <TextInput
                type="number"
                label="Amount"
                step="0.01"
                required
                placeholder="0.00"
                inputMode="decimal"
                value={part.amount}
                onChange={(e) => setPart(i, { amount: e.target.value })}
              />
            </div>
            {parts.length > 2 && (
              <button
                type="button"
                onClick={() => onChange(parts.filter((_, j) => j !== i))}
                className={`mt-6 text-[var(--ink-500)] hover:text-[var(--danger)] shrink-0 ${TAP_TARGET_PAD}`}
                aria-label={`Remove part ${i + 1}`}
              >
                <XIcon width={16} height={16} />
              </button>
            )}
          </div>
          <TextInput
            type="text"
            label="Memo"
            placeholder="e.g. Amazon — kitchen items"
            value={part.memo}
            onChange={(e) => setPart(i, { memo: e.target.value })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => {
          // Foolproof auto-balance: when there's a target, the new part
          // starts at whatever is still missing.
          const prefill = remainderCents != null && remainderCents !== 0 ? (remainderCents / 100).toFixed(2) : "";
          onChange([...parts, { ...emptyPart(), amount: prefill }]);
        }}
        className={`text-sm font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
      >
        + Add another part
      </button>

      {targetCents != null && (
        <p
          className={
            "text-sm font-medium tabular-nums " +
            (remainderCents === 0 ? "text-[var(--success-700)]" : "text-[var(--warning-700)]")
          }
        >
          {/* Neutral "away from" rather than remaining/over -- the
              direction words flip their meaning on a negative (credit)
              line, and the number is what the user acts on. */}
          {remainderCents === 0
            ? `Parts add up to ${formatMoney(targetCents / 100)} — matches the original line.`
            : `Parts add up to ${formatMoney(sumCents / 100)} of ${formatMoney(targetCents / 100)} — ${formatMoney(
                Math.abs((remainderCents ?? 0) / 100)
              )} away from the original line.`}
        </p>
      )}
    </div>
  );
}
