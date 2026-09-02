"use client";

import { useState } from "react";
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

/** Splits target cents by integer weights, cent-exact: every part gets
 * its floor share, leftover cents go one each to the earliest parts —
 * the shares always sum to the target, never target ± rounding. */
export function splitByWeights(targetCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (targetCents * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  let leftover = targetCents - floored.reduce((a, b) => a + b, 0);
  return floored.map((f) => {
    const cents = f + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover -= 1;
    return cents;
  });
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

  /* Entry modes (2026-08-31, Aey: "want it auto sum other amount. add
   * option to add as percentage or shares... like Splitwise app did").
   * The submitted truth stays DOLLARS in parts[].amount — % and shares
   * are input conveniences layered on top: typing in either recomputes
   * every part's dollar amount from the ORIGINAL LINE's total,
   * cent-exact (see splitByWeights). Only offered when there is a
   * target to compute against; the entry-time split (no target yet)
   * keeps plain dollars. */
  const [mode, setMode] = useState<"AMOUNT" | "PERCENT" | "SHARES">("AMOUNT");
  const [modeInputs, setModeInputs] = useState<string[]>([]);

  const recomputeFromWeights = (inputs: string[]) => {
    if (targetCents == null) return;
    const weights = parts.map((_, i) => {
      const n = Number(inputs[i]);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
    const centsList = splitByWeights(targetCents, weights);
    onChange(parts.map((p, i) => ({ ...p, amount: weights[i] > 0 ? (centsList[i] / 100).toFixed(2) : "" })));
  };

  const switchMode = (next: "AMOUNT" | "PERCENT" | "SHARES") => {
    setMode(next);
    if (next === "PERCENT" && targetCents != null && targetCents !== 0) {
      // Seed from the current dollar amounts so switching doesn't wipe
      // work already typed.
      setModeInputs(
        parts.map((p) => {
          const cents = toCents(p.amount);
          return cents != null && cents !== 0 ? String(Math.round((cents / targetCents) * 10000) / 100) : "";
        })
      );
    } else if (next === "SHARES") {
      setModeInputs(parts.map(() => "1"));
      // Equal shares is the obvious starting point — recompute right away
      // so the dollars underneath match what the inputs claim.
      if (targetCents != null) {
        const centsList = splitByWeights(targetCents, parts.map(() => 1));
        onChange(parts.map((p, i) => ({ ...p, amount: (centsList[i] / 100).toFixed(2) })));
      }
    }
  };

  const setPart = (i: number, patch: Partial<EditablePart>) => {
    onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  };

  return (
    <div className="space-y-3">
      {targetCents != null && targetCents !== 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--ink-500)] mr-1">Split by</span>
          {(
            [
              { key: "AMOUNT", label: "$ amounts" },
              { key: "PERCENT", label: "%" },
              { key: "SHARES", label: "shares" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => switchMode(m.key)}
              aria-pressed={mode === m.key}
              className={
                "min-h-8 px-2.5 rounded-[var(--radius-full)] text-xs font-medium border " +
                (mode === m.key
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)] hover:bg-[var(--hover)]")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
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
              {mode === "AMOUNT" ? (
                <div>
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
                  {/* One-tap auto-balance (2026-08-31, Aey: "auto sum
                      other amount") — sets THIS part to whatever still
                      separates the parts from the original line. */}
                  {remainderCents != null && remainderCents !== 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const current = toCents(part.amount) ?? 0;
                        setPart(i, { amount: ((current + remainderCents) / 100).toFixed(2) });
                      }}
                      className="mt-1 text-xs text-[var(--primary-700)] underline underline-offset-2 min-h-6"
                    >
                      Balance → {formatMoney(((toCents(part.amount) ?? 0) + remainderCents) / 100)}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <TextInput
                    type="number"
                    label={mode === "PERCENT" ? "Percent" : "Shares"}
                    step={mode === "PERCENT" ? "0.01" : "1"}
                    min="0"
                    required
                    placeholder={mode === "PERCENT" ? "0" : "1"}
                    inputMode="decimal"
                    value={modeInputs[i] ?? ""}
                    onChange={(e) => {
                      const next = [...modeInputs];
                      next[i] = e.target.value;
                      setModeInputs(next);
                      recomputeFromWeights(next);
                    }}
                  />
                  <p className="text-xs text-[var(--ink-500)] mt-1 tabular-nums">
                    = {part.amount ? formatMoney(Number(part.amount)) : "—"}
                  </p>
                </div>
              )}
            </div>
            {parts.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  onChange(parts.filter((_, j) => j !== i));
                  if (mode !== "AMOUNT") {
                    const next = modeInputs.filter((_, j) => j !== i);
                    setModeInputs(next);
                    recomputeFromWeights(next);
                  }
                }}
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
          if (mode !== "AMOUNT") setModeInputs([...modeInputs, ""]);
        }}
        className={`text-sm font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
      >
        + Add another part
      </button>

      {/* When the money balances but the submit is still disabled, SAY
          WHY (2026-08-31 visual audit: green all-clear beside a disabled
          button with no explanation — Nielsen #1). */}
      {remainderCents === 0 && !partsComplete(parts) && (
        <p className="text-sm text-[var(--warning-700)]">
          {parts
            .map((part, i) => ({ part, i }))
            .filter(({ part }) => part.categoryId === "" || (toCents(part.amount) ?? 0) === 0)
            .map(({ part, i }) =>
              part.categoryId === "" ? `Part ${i + 1} still needs a category` : `Part ${i + 1} still needs an amount`
            )
            .join(" · ")}
          .
        </p>
      )}
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
