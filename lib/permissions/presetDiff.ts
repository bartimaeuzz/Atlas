/**
 * What applying an Account Type preset to one employee would actually
 * change (2026-08-22).
 *
 * Pure and separately testable on purpose. This drives the preview panel
 * on /permissions, and a preview that misstates the change is worse than
 * no preview at all — it trains an Admin to click through. So the rule
 * lives here with unit tests against it, not inline in the component.
 *
 * It must stay in lockstep with applyAccountTypePreset in
 * lib/actions/permissions.ts, which is the thing actually doing the
 * writing: same MANAGE_PERMISSIONS skip, same "overwrite every registry
 * key to the preset default and null the expiry" semantics.
 */

import { CAPABILITIES, type AccountType } from "./capabilities";
import { grantAllows, type CapabilityGrantRow } from "./grantAllows";

export interface PresetDiff {
  /** Not held today, granted by the preset. */
  turningOn: string[];
  /** Held today, not granted by the preset. */
  turningOff: string[];
  /** Row says granted but the expiry has passed, and the preset grants
   * it — so wiping the date hands the access back. Called out separately
   * because it reads as a no-op in the raw column and is not one. */
  restoringExpired: string[];
}

export function computePresetDiff(
  capabilities: Record<string, CapabilityGrantRow>,
  accountType: AccountType,
  today?: string,
): PresetDiff {
  const turningOn: string[] = [];
  const turningOff: string[] = [];
  const restoringExpired: string[] = [];

  for (const def of CAPABILITIES) {
    // Skipped by the server action too — it is tied to the Admin role,
    // not individually grantable. Previewing a change that will not
    // happen is its own kind of lie.
    if (def.key === "MANAGE_PERMISSIONS") continue;

    const row = capabilities[def.key] ?? { granted: false, expiresAt: null };
    // Effective access, not the raw `granted` column: an expired row
    // reads granted=true while the person does NOT hold it today.
    // isAdmin is deliberately false — this describes what happens to the
    // stored rows; the Admin bypass is surfaced separately in the UI,
    // since for an Admin none of these row changes affect real access.
    const heldNow = grantAllows(false, row, today);
    const next = def.defaults[accountType];

    if (!heldNow && next) {
      if (row.granted && row.expiresAt) restoringExpired.push(def.label);
      else turningOn.push(def.label);
    } else if (heldNow && !next) {
      turningOff.push(def.label);
    }
  }

  return { turningOn, turningOff, restoringExpired };
}

export function presetDiffIsEmpty(diff: PresetDiff): boolean {
  return diff.turningOn.length === 0 && diff.turningOff.length === 0 && diff.restoringExpired.length === 0;
}
