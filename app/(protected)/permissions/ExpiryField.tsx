"use client";

import { useState } from "react";
import { addDays, toIso } from "@/lib/schedule/weekMath";

/** Per-item expiry for a Financial Auditor capability (2026-08-23,
 * Oliver: preset buttons plus a date picker, and "no expiry" as an
 * explicit choice rather than an empty box).
 *
 * THE STORED SHAPE DOES NOT CHANGE. The buttons only fill the same
 * `exp_<KEY>` date input the form already posted, so nothing on the
 * server, in the action, or in the column had to move — a duration is
 * resolved to an absolute date here, at the moment of choosing, which is
 * also the only moment "30 days" has an unambiguous meaning.
 *
 * Empty still means no expiry, exactly as before. What changed is that
 * an empty box used to be the only way to say so, and an empty box is
 * indistinguishable from "not filled in yet" — the same complaint that
 * produced the explicit "No petty cash spent today" button on the Ledger
 * day flow. Now it is something you press.
 */
const PRESETS = [7, 30, 90] as const;

export function ExpiryField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  // Recomputed per render rather than captured once: a card left open
  // across midnight would otherwise offer "30 days" measured from
  // yesterday. Cheap, and wrong-by-a-day on a permission expiry is the
  // kind of small lie that costs someone their access at 9am.
  const today = toIso(new Date());
  const activePreset = PRESETS.find((d) => addDays(today, d) === value) ?? null;
  const isNoExpiry = value === "";

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-7">
      <span className="text-xs text-[var(--ink-500)] mr-0.5">Expires</span>

      <Chip active={isNoExpiry} onClick={() => setValue("")}>
        Never
      </Chip>
      {PRESETS.map((d) => (
        <Chip key={d} active={activePreset === d} onClick={() => setValue(addDays(today, d))}>
          {d} days
        </Chip>
      ))}

      <input
        type="date"
        name={name}
        value={value}
        min={today}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Expiry date"
        className="min-h-11 border border-[var(--border-strong)] rounded-[var(--radius-md)] px-2 py-1 text-sm bg-[var(--card)] text-[var(--ink-900)]"
      />

      {/* Says the consequence in words, because a date alone does not.
          "2026-08-31" does not read as "she loses this in 8 days" to
          someone scanning a page of them. */}
      <span className="text-xs text-[var(--ink-500)]">
        {isNoExpiry ? "— stays until removed by hand" : `— access ends after ${value}`}
      </span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "min-h-11 px-2.5 rounded-[var(--radius-full)] text-xs font-medium border transition-colors " +
        (active
          ? "bg-[var(--primary)] text-white border-[var(--primary)]"
          : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)] hover:bg-[var(--paper)]")
      }
    >
      {children}
    </button>
  );
}
