"use client";

import { useRef } from "react";
import { groupThousands, ungroupThousands } from "@/lib/format/groupThousands";

/** A dollar field that obeys both of the rules that apply to it: it SHOWS
 * a thousands separator, and it POSTS BACK exactly the number that was
 * stored (2026-09-05).
 *
 * Uncontrolled on purpose. A controlled input that reformats on every
 * keystroke has to put the caret back afterwards, and gets it wrong the
 * moment somebody edits the middle of a number — so the commas are applied
 * at the two moments the caret is not in play instead:
 *
 *   on mount  — the stored value arrives already grouped, which is the
 *               thing Oliver was looking at when he asked.
 *   on blur   — whatever was typed is grouped once the field is left.
 *   on focus  — commas come off, so typing and arrow keys behave like a
 *               plain number field while the field is being used.
 *
 * `type="text"` with `inputMode="decimal"`, never `type="number"`: a number
 * input silently discards a typed comma, which turns 3,800 into an empty
 * box in front of someone who has no idea why. The same reasoning the
 * sales-target fields already carried before this component existed.
 *
 * Uncontrolled also keeps `useKeepValuesOnError` working — it restores from
 * a DOM snapshot, so the values survive a refused save.
 */
export function MoneyInput({
  name,
  defaultValue,
  className = "",
  ...rest
}: {
  name: string;
  /** The stored number, or null/undefined for an empty field. Passed as a
   * number rather than a string so no caller can round it on the way in. */
  defaultValue?: number | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "type" | "name">) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      name={name}
      // String(), not toLocaleString(): the number is turned into digits
      // first and grouped as a string, so nothing rounds. See
      // lib/format/groupThousands.ts.
      defaultValue={defaultValue == null ? "" : groupThousands(String(defaultValue))}
      onFocus={(e) => {
        e.currentTarget.value = ungroupThousands(e.currentTarget.value);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.value = groupThousands(e.currentTarget.value);
        rest.onBlur?.(e);
      }}
      className={
        "min-h-11 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] " +
        "px-3 text-right tabular-nums text-[var(--ink-900)] outline-offset-2 " +
        "focus-visible:outline-2 focus-visible:outline-[var(--primary)] " +
        className
      }
      {...rest}
    />
  );
}
