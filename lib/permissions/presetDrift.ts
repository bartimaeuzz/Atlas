/**
 * How far one account's capabilities have drifted from the preset it was
 * put on (2026-08-23). Drives the summary column on /permissions' role
 * cards: "+HR records, −Payroll export".
 *
 * Built on computePresetDiff rather than beside it, so there is one
 * definition of "what the preset says" in the codebase. But the SIGNS ARE
 * INVERTED relative to that function, and that is the whole reason this
 * is a separate, tested module instead of two lines in a component:
 *
 *   computePresetDiff answers "what would applying the preset DO?"
 *   this answers            "what does this person HAVE that the preset didn't?"
 *
 * so the preset's `turningOff` (it would take this away) is this module's
 * `extra` (they were given something beyond their preset), and the
 * preset's `turningOn` (it would grant this) is this module's `missing`
 * (they are short of their preset). Getting that backwards produces a
 * summary that reads exactly wrong while looking perfectly plausible --
 * an Admin would see "+Payroll export" next to someone who cannot export
 * payroll.
 */

import { computePresetDiff } from "./presetDiff";
import type { AccountType } from "./capabilities";
import type { CapabilityGrantRow } from "./grantAllows";

export interface PresetDrift {
  /** Held beyond what the preset grants — shown with a leading +. */
  extra: string[];
  /** Granted by the preset but not held — shown with a leading −.
   * Includes grants that have lapsed by their expiry date: the person
   * does not hold it today, which is what this column is about. */
  missing: string[];
}

export function computePresetDrift(
  capabilities: Record<string, CapabilityGrantRow>,
  accountType: AccountType,
  today?: string,
): PresetDrift {
  const diff = computePresetDiff(capabilities, accountType, today);
  return {
    extra: diff.turningOff,
    missing: [...diff.turningOn, ...diff.restoringExpired],
  };
}

export function driftIsEmpty(drift: PresetDrift): boolean {
  return drift.extra.length === 0 && drift.missing.length === 0;
}

/** One short line for a table cell. Caps the list so a badly drifted
 * account does not push the row to six lines — the full picture is one
 * click away in the panel below, and a summary that has to be scrolled
 * is not a summary. */
export function summarizeDrift(drift: PresetDrift, max = 3): string {
  const parts = [...drift.extra.map((l) => `+${l}`), ...drift.missing.map((l) => `−${l}`)];
  if (parts.length === 0) return "";
  if (parts.length <= max) return parts.join(", ");
  return `${parts.slice(0, max).join(", ")} +${parts.length - max} more`;
}
