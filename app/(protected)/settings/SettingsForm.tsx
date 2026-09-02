"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateRestaurantSettings, type SettingsActionState } from "@/lib/actions/settings";
import type { RestaurantSettingsData } from "@/lib/settings/loadRestaurantSettings";
import type { PackerBonusConfig } from "@/lib/settings/packerBonus";
import { useEffect, useState } from "react";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: SettingsActionState = { error: null, saved: false };

/**
 * Read-only affordance (2026-08-22, visual-audit finding).
 *
 * This form is rendered inside a `<fieldset disabled>` by page.tsx when
 * the viewer holds VIEW_SETTINGS but not EDIT_SETTINGS. That correctly
 * disables every control's *behaviour* — but a disabled fieldset changes
 * nothing about how its children *look*, so the live audit found the
 * fields rendering identically to editable ones: opacity 1, transparent
 * background, 17:1 text contrast, default cursor. A Partner tapped a
 * field, nothing happened, and the only explanation was a banner ~2.3
 * phone screens further up.
 *
 * Text colour is deliberately NOT muted. The entire point of this mode
 * is reading the configuration, so the values must stay fully legible —
 * the state is signalled by the filled background, flattened border and
 * cursor instead. (components/ui/Field.tsx mutes its disabled text; that
 * is right for a normally-editable field that happens to be locked, and
 * wrong for a page whose read-only state is the expected one.)
 */
const DISABLED_FIELD =
  "disabled:bg-[var(--paper)] disabled:border-[var(--border)] disabled:cursor-not-allowed";
/** Checkboxes/radios: the browser already greys the control itself, so
 * this only needs to fix the misleading pointer. */
const DISABLED_TOGGLE = "disabled:cursor-not-allowed";

export function SettingsForm({
  settings,
  packerBonus,
  positions,
  isAdmin,
}: {
  settings: RestaurantSettingsData;
  packerBonus: PackerBonusConfig;
  positions: { id: number; name: string; category: "FOH" | "BOH" }[];
  /** Only an Admin may change the two-person money controls — a safeguard
   * the people it constrains can switch off is not a safeguard. Managers
   * see the current state as read-only text instead of switches. */
  isAdmin: boolean;
}) {
  const [state, formAction, isPending] = useActionState(updateRestaurantSettings, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  // "Saved ✓" flash on the button itself (2026-08-31, third member of the
  // above-the-fold class after staffing targets and the People form) —
  // same derived nonce-and-timer pattern as ClosingReportForm.
  const [clearedSavedAt, setClearedSavedAt] = useState<number | null>(null);
  const justSaved = !!state.savedAt && state.savedAt !== clearedSavedAt;
  useEffect(() => {
    if (!state.savedAt || state.savedAt === clearedSavedAt) return;
    const savedAt = state.savedAt;
    const t = setTimeout(() => setClearedSavedAt(savedAt), 2000);
    return () => clearTimeout(t);
  }, [state.savedAt, clearedSavedAt]);
  // Controlled only to swap the rate hint between the two styles.
  const [packerStyle, setPackerStyle] = useState<"PERCENT" | "PER_BLOCK">(packerBonus.style);

  return (
    <form ref={formRef} action={formAction} className="space-y-8 max-w-2xl">
      <fieldset>
        <legend className="text-lg font-medium mb-3">Restaurant</legend>
        <label className="text-sm block">
          <span className="block text-[var(--ink-500)] mb-1">Restaurant name</span>
          <input
            type="text"
            name="restaurantName"
            maxLength={60}
            defaultValue={settings.restaurantName ?? ""}
            placeholder="e.g. Youk Thai"
            autoComplete="organization"
            className={`border rounded px-3 py-1.5 text-sm w-full max-w-sm min-h-11 ${DISABLED_FIELD}`}
          />
          <span className="block text-xs text-[var(--ink-500)] mt-1">
            Your restaurant&rsquo;s name as staff should see it. Optional for now — it will appear on the sign-in screen and side menu once that part ships.
          </span>
        </label>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Tips</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">CC tip deduction rate</span>
            <div className="relative w-32">
              <input
                type="number"
                step="0.001"
                min="0"
                max="100"
                name="ccTipDeductionRatePercent"
                defaultValue={settings.ccTipDeductionRate * 100}
                className={`border rounded pl-3 pr-6 py-1.5 text-sm w-full ${DISABLED_FIELD}`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm pointer-events-none">%</span>
            </div>
            <span className="block text-xs text-[var(--ink-400)] mt-1">e.g. 4.5 for 4.5% — processor cut off card tips</span>
          </label>
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">Host drink bonus, $/drink</span>
            <div className="relative w-32">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="hostDrinkBonusPerDrinkAmount"
                defaultValue={settings.hostDrinkBonusPerDrinkAmount}
                className={`border rounded pl-6 pr-3 py-1.5 text-sm w-full ${DISABLED_FIELD}`}
              />
            </div>
            <span className="block text-xs text-[var(--ink-400)] mt-1">0 turns the bonus off entirely</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Sales tax</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">Default sales tax rate</span>
            <div className="relative w-32">
              <input
                type="number"
                step="0.001"
                min="0"
                max="100"
                name="defaultSalesTaxRatePercent"
                defaultValue={settings.defaultSalesTaxRate * 100}
                className={`border rounded pl-3 pr-6 py-1.5 text-sm w-full ${DISABLED_FIELD}`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm pointer-events-none">%</span>
            </div>
            <span className="block text-xs text-[var(--ink-400)] mt-1">
              NYC&apos;s combined rate is 8.875% — used to auto-fill the Sales tax field on each
              Closing Report; a manager can always edit it per shift if Toast&apos;s real number differs
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Packer bonus (off-premise sales)</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          A house-paid bonus on everything the packer packs — Toast takeout + Toast delivery + every
          online platform&apos;s sales, all pre-tax. Paid by the restaurant on top of wages,{" "}
          <span className="font-medium">never taken from any tip pool</span>. When more than one person
          works the packer position on a shift, they split the one bonus equally.
        </p>
        <div className="space-y-3">
          <label className={`flex items-center gap-2 text-sm min-h-11 ${DISABLED_TOGGLE}`}>
            <input
              type="checkbox"
              name="packerBonusEnabled"
              defaultChecked={packerBonus.enabled}
              className={`size-4 accent-[var(--primary)] ${DISABLED_TOGGLE}`}
            />
            Pay the packer bonus
          </label>
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">How it&apos;s counted</span>
              <select
                name="packerBonusStyle"
                defaultValue={packerBonus.style}
                onChange={(e) => setPackerStyle(e.target.value as "PERCENT" | "PER_BLOCK")}
                className={`border rounded px-3 py-1.5 text-sm w-full min-h-11 ${DISABLED_FIELD}`}
              >
                <option value="PERCENT">% of off-premise sales</option>
                <option value="PER_BLOCK">$ per full $100 of sales</option>
              </select>
            </label>
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">Rate</span>
              <div className="relative w-32">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="packerBonusRate"
                  defaultValue={packerBonus.rate}
                  className={`border rounded pl-3 pr-6 py-1.5 text-sm w-full min-h-11 ${DISABLED_FIELD}`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm pointer-events-none">
                  {packerStyle === "PERCENT" ? "%" : "$"}
                </span>
              </div>
              <span className="block text-xs text-[var(--ink-400)] mt-1">
                {packerStyle === "PERCENT"
                  ? "e.g. 1 — $199 of off-premise sales pays $1.99"
                  : "e.g. 1 — $199 pays $1 (only full $100s count)"}
              </span>
            </label>
            <label className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">Position that earns it</span>
              <select
                name="packerBonusPositionId"
                defaultValue={packerBonus.positionId ?? ""}
                className={`border rounded px-3 py-1.5 text-sm w-full min-h-11 ${DISABLED_FIELD}`}
              >
                <option value="">— pick a position —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Supplier checks</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Two money controls from the check lifecycle. Both are permanent-record settings — every
          change here is written to the Activity log with before/after.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">Next check number</span>
            <input
              type="number"
              step="1"
              min="1"
              name="nextCheckNumber"
              defaultValue={settings.nextCheckNumber ?? ""}
              placeholder="not set"
              className={`border rounded px-3 py-1.5 text-sm w-40 min-h-11 ${DISABLED_FIELD}`}
            />
            <span className="block text-xs text-[var(--ink-400)] mt-1">
              Set once to the next unused number in the physical checkbook — Mohom assigns and
              advances it automatically from there. Exporting is refused until this is set. Voided
              numbers stay burned.
            </span>
          </label>
          <label className="text-sm block">
            <span className="block text-[var(--ink-500)] mb-1">Instant-check ceiling</span>
            <div className="relative w-40">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="instantCheckCeiling"
                defaultValue={settings.instantCheckCeiling}
                className={`border rounded pl-6 pr-3 py-1.5 text-sm w-full min-h-11 ${DISABLED_FIELD}`}
              />
            </div>
            <span className="block text-xs text-[var(--ink-400)] mt-1">
              A single-person instant check above this amount needs a second approver&apos;s PIN.
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Two-person money controls</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Recording money stays open to everyone. These cover the steps that
          <strong> commit</strong> it — where money leaves or a record locks for good. With one on, a
          second person who can do the same job types their PIN; it only has to be somebody other
          than you. Leave them off while one person works alone — anything done alone is marked as
          such on the record.
        </p>
        {isAdmin ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 min-h-11 py-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="requireTwoPersonPayroll"
                defaultChecked={settings.requireTwoPersonPayroll}
                className={`mt-0.5 size-5 shrink-0 accent-[var(--primary)] ${DISABLED_TOGGLE}`}
              />
              <span className="text-[var(--ink-900)]">
                Locking a payroll week needs a second person
                <span className="block text-[var(--ink-500)] mt-0.5">
                  Once a week is marked paid it becomes the locked record everyone is paid from.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 min-h-11 py-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="requireTwoPersonCardReconcile"
                defaultChecked={settings.requireTwoPersonCardReconcile}
                className={`mt-0.5 size-5 shrink-0 accent-[var(--primary)] ${DISABLED_TOGGLE}`}
              />
              <span className="text-[var(--ink-900)]">
                Closing a card statement period needs a second person
                <span className="block text-[var(--ink-500)] mt-0.5">
                  Reconciling closes the period against the bank statement.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <ul className="text-sm text-[var(--ink-700)] space-y-1">
            <li>
              Locking a payroll week: <strong>{settings.requireTwoPersonPayroll ? "needs two people" : "one person"}</strong>
            </li>
            <li>
              Closing a card period:{" "}
              <strong>{settings.requireTwoPersonCardReconcile ? "needs two people" : "one person"}</strong>
            </li>
            <li className="text-xs text-[var(--ink-500)] pt-1">Only an admin can change these.</li>
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">POS closeout</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          What the Closing Report does when a second shift of the day closes and the numbers being
          copied might include the earlier shift. &quot;Ask every time&quot; is the safe default while
          nobody is sure how the POS is configured; either fixed answer still shows the math — nothing
          is ever subtracted silently.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              { name: "toastCloseoutMode", label: "Toast numbers", value: settings.toastCloseoutMode },
              { name: "platformCloseoutMode", label: "Online platform dashboards", value: settings.platformCloseoutMode },
            ] as const
          ).map((f) => (
            <label key={f.name} className="text-sm block">
              <span className="block text-[var(--ink-500)] mb-1">{f.label}</span>
              <select name={f.name} defaultValue={f.value} className={`border rounded px-3 py-1.5 text-sm w-full min-h-11 ${DISABLED_FIELD}`}>
                <option value="ASK">Ask every time (safe default)</option>
                <option value="PER_SHIFT">Clears each shift — numbers are per-shift</option>
                <option value="CUMULATIVE">Shows the whole day — subtract the earlier shift</option>
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Staff login</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          How staff sign in on the <Link href="/login" className="underline">/login</Link> page. &quot;Login ID&quot;
          uses the YK ID generated per person on the <Link href="/people" className="underline">People</Link> page
          instead of picking a name from a list.
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 min-h-11">
            <input
              type="radio"
              className={DISABLED_TOGGLE}
              name="staffLoginMethod"
              value="NAME"
              defaultChecked={settings.staffLoginMethod === "NAME"}
            />
            Pick your name from a list
          </label>
          <label className="flex items-center gap-2 min-h-11">
            <input
              type="radio"
              className={DISABLED_TOGGLE}
              name="staffLoginMethod"
              value="ID"
              defaultChecked={settings.staffLoginMethod === "ID"}
            />
            Type your login ID
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Tip pools</legend>
        <Link
          href="/settings/tip-pools"
          className="flex items-center justify-between gap-3 border rounded-[var(--radius-md)] p-4 hover:bg-[var(--hover)] hover:border-[var(--border-strong)]"
        >
          <span>
            <span className="block text-sm font-medium">Manage tip pool assignment &amp; split method</span>
            <span className="block text-xs text-[var(--ink-500)] mt-0.5">
              Which positions are in Pool 1 / 2 / 3, and whether each pool splits point-weighted or equal
            </span>
          </span>
          <span className="text-[var(--ink-400)] text-lg" aria-hidden>
            →
          </span>
        </Link>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster — peer earnings visibility</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Whether STAFF can see a peer&apos;s tip share / wage on the roster (self always visible; leadership pay
          always hidden regardless of these). Tip and wage are independent toggles — you can show one without the
          other.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--ink-400)] uppercase tracking-wide">Tip share</div>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowPeerTipFOH" defaultChecked={settings.rosterShowPeerTipFOH} />
              Show FOH peer tip share
            </label>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowPeerTipBOH" defaultChecked={settings.rosterShowPeerTipBOH} />
              Show BOH peer tip share
            </label>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--ink-400)] uppercase tracking-wide">Wage</div>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowPeerWageFOH" defaultChecked={settings.rosterShowPeerWageFOH} />
              Show FOH peer wage
            </label>
            <label className="flex items-center gap-2 min-h-11">
              <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowPeerWageBOH" defaultChecked={settings.rosterShowPeerWageBOH} />
              Show BOH peer wage
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster &amp; schedule — coworker list visibility</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Whether STAFF see who else is on the list at all — names and positions, not just the $ figures. Covers
          both My Pay&apos;s &quot;Also worked this shift&quot; list and the &quot;who&apos;s working this day&quot;
          preview staff can open from My Schedule&apos;s calendar. When off, staff only see their own pay / their
          own day, nothing about who else is scheduled. Self is always unaffected. Independent from the
          peer-earnings setting above: you can hide the list entirely even if peer earnings are on, or keep the
          list visible with earnings redacted.
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 min-h-11">
            <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowCoworkerListFOH" defaultChecked={settings.rosterShowCoworkerListFOH} />
            Show coworker list to FOH staff
          </label>
          <label className="flex items-center gap-2 min-h-11">
            <input type="checkbox" className={DISABLED_TOGGLE} name="rosterShowCoworkerListBOH" defaultChecked={settings.rosterShowCoworkerListBOH} />
            Show coworker list to BOH staff
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster & schedule — category visibility</legend>
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Whether STAFF are restricted to seeing only their own category&apos;s entries (FOH sees FOH, BOH sees
          BOH), plus always-visible positions like Floor Manager. Applies to both the day-of roster and the
          schedule &quot;who&apos;s working this day&quot; preview on My Schedule — one policy, both places.
          Managers/Admins always see everyone regardless of this setting.
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 min-h-11">
            <input type="checkbox" className={DISABLED_TOGGLE} name="rosterRestrictFOHToOwnCategory" defaultChecked={settings.rosterRestrictFOHToOwnCategory} />
            Restrict FOH staff to FOH-only view
          </label>
          <label className="flex items-center gap-2 min-h-11">
            <input type="checkbox" className={DISABLED_TOGGLE} name="rosterRestrictBOHToOwnCategory" defaultChecked={settings.rosterRestrictBOHToOwnCategory} />
            Restrict BOH staff to BOH-only view
          </label>
        </div>
      </fieldset>

      {/* Error and result live BESIDE the button, where the eyes are at
          save time — the old top-of-page banners were invisible from a
          form this long (2026-08-31, Aey's report on this exact page). */}
      {state.error && (
        <div className="border border-[var(--danger-border)] bg-[var(--danger-tint)] text-[var(--danger-700)] rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}
      <div aria-live="polite">
        <button
          type="submit"
          disabled={isPending}
          className={
            "px-4 py-2 min-h-11 rounded-[var(--radius-md)] text-sm disabled:opacity-50 transition-colors " +
            (justSaved ? "bg-[var(--success)] text-white" : "bg-[var(--primary)] text-white hover:bg-[var(--primary-700)]")
          }
        >
          {isPending ? "Saving…" : justSaved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
