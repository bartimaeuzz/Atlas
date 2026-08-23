"use client";

import { useState } from "react";
import { addDays, toIso } from "@/lib/schedule/weekMath";

/** Per-item expiry for a Financial Auditor capability.
 *
 * Shape confirmed by Oliver 2026-08-23: `dropdown | "or" | date picker`.
 * The dropdown carries the everyday answers — never, or a round number of
 * days — and the picker is there for the one case a dropdown cannot cover.
 * The literal word "or" between them is doing real work: two adjacent
 * controls that both set the same value read as two separate settings you
 * have to fill in, and "or" is the cheapest way to say only one of these
 * matters.
 *
 * THE STORED SHAPE DOES NOT CHANGE. Both controls write the same
 * `exp_<KEY>` date the form already posted, so nothing on the server, in
 * the action, or in the column had to move — a duration is resolved to an
 * absolute date here, at the moment of choosing, which is also the only
 * moment "30 days" has an unambiguous meaning.
 *
 * Empty still means no expiry, exactly as before. What changed is that an
 * empty box used to be the only way to say so, and an empty box is
 * indistinguishable from "not filled in yet" — the same complaint that
 * produced the explicit "No petty cash spent today" button on the Ledger
 * day flow. Now it is something you choose.
 */
const PRESET_DAYS = [7, 30, 60, 90] as const;

export function ExpiryField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  // Recomputed per render rather than captured once: a card left open
  // across midnight would otherwise offer "30 days" measured from
  // yesterday. Cheap, and wrong-by-a-day on a permission expiry is the
  // kind of small lie that costs someone their access at 9am.
  const today = toIso(new Date());
  const matchedPreset = PRESET_DAYS.find((d) => addDays(today, d) === value);
  const selectValue = value === "" ? "never" : matchedPreset ? String(matchedPreset) : "custom";

  return (
    <div className="flex flex-wrap items-center gap-2 pl-7">
      <label className="text-xs text-[var(--ink-500)]" htmlFor={`${name}__select`}>
        Expires
      </label>

      <select
        id={`${name}__select`}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          // "custom" is display-only — it is what the dropdown shows when
          // the date came from the picker. Selecting it must not wipe the
          // date the picker just set, so it deliberately does nothing.
          if (v === "never") setValue("");
          else if (v !== "custom") setValue(addDays(today, Number(v)));
        }}
        className="min-h-11 border border-[var(--border-strong)] rounded-[var(--radius-md)] px-2 text-sm bg-[var(--card)] text-[var(--ink-900)]"
      >
        <option value="never">Never</option>
        {PRESET_DAYS.map((d) => (
          <option key={d} value={d}>
            In {d} days
          </option>
        ))}
        {selectValue === "custom" && <option value="custom">On a set date</option>}
      </select>

      <span className="text-xs text-[var(--ink-500)]">or</span>

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
        {value === "" ? "— stays until removed by hand" : `— access ends after ${value}`}
      </span>
    </div>
  );
}
