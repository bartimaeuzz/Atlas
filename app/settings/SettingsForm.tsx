"use client";

import { useActionState } from "react";
import { updateRestaurantSettings, type SettingsActionState } from "@/lib/actions/settings";
import type { RestaurantSettingsData } from "@/lib/settings/loadRestaurantSettings";

const initialState: SettingsActionState = { error: null, saved: false };

function PoolMethodSelect({ name, defaultValue, label }: { name: string; defaultValue: string; label: string }) {
  return (
    <label className="text-sm block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <select name={name} defaultValue={defaultValue} className="border rounded px-2 py-1.5 text-sm">
        <option value="POINT_WEIGHTED">Point-weighted</option>
        <option value="EQUAL_SPLIT">Equal split</option>
      </select>
    </label>
  );
}

export function SettingsForm({ settings }: { settings: RestaurantSettingsData }) {
  const [state, formAction, isPending] = useActionState(updateRestaurantSettings, initialState);

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}
      {state.saved && !state.error && (
        <div className="border border-green-300 bg-green-50 text-green-700 rounded p-3 text-sm">Saved.</div>
      )}

      <fieldset>
        <legend className="text-lg font-medium mb-3">Tips</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm block">
            <span className="block text-neutral-500 mb-1">CC tip deduction rate</span>
            <input
              type="number"
              step="0.001"
              name="ccTipDeductionRate"
              defaultValue={settings.ccTipDeductionRate}
              className="border rounded px-3 py-1.5 text-sm w-32"
            />
            <span className="block text-xs text-neutral-400 mt-1">e.g. 0.045 for 4.5% — processor cut off card tips</span>
          </label>
          <label className="text-sm block">
            <span className="block text-neutral-500 mb-1">Host drink bonus, $/drink</span>
            <input
              type="number"
              step="0.01"
              name="hostDrinkBonusPerDrinkAmount"
              defaultValue={settings.hostDrinkBonusPerDrinkAmount}
              className="border rounded px-3 py-1.5 text-sm w-32"
            />
            <span className="block text-xs text-neutral-400 mt-1">0 turns the bonus off entirely</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Tip pool split method</legend>
        <div className="grid sm:grid-cols-3 gap-4">
          <PoolMethodSelect name="pool1SplitMethod" defaultValue={settings.pool1SplitMethod} label="Pool 1 — Dine-in" />
          <PoolMethodSelect name="pool2SplitMethod" defaultValue={settings.pool2SplitMethod} label="Pool 2 — Takeout/online" />
          <PoolMethodSelect name="pool3SplitMethod" defaultValue={settings.pool3SplitMethod} label="Pool 3 — Delivery" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster — peer earnings visibility</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Whether STAFF can see a peer&apos;s tip share / wage on the roster (self always visible; leadership pay
          always hidden regardless of these).
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterShowPeerEarningsFOH" defaultChecked={settings.rosterShowPeerEarningsFOH} />
            Show FOH peer earnings
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterShowPeerEarningsBOH" defaultChecked={settings.rosterShowPeerEarningsBOH} />
            Show BOH peer earnings
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster — coworker list visibility (My Pay)</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Whether STAFF see the &quot;Also worked this shift&quot; coworker list on My Pay at all — names and
          positions, not just the $ figures above. When off, staff logging in only see their own pay, nothing
          about who else worked. Self is always unaffected. Independent from the peer-earnings setting above: you
          can hide the list entirely even if peer earnings are on, or keep the list visible with earnings redacted.
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterShowCoworkerListFOH" defaultChecked={settings.rosterShowCoworkerListFOH} />
            Show coworker list to FOH staff
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterShowCoworkerListBOH" defaultChecked={settings.rosterShowCoworkerListBOH} />
            Show coworker list to BOH staff
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium mb-3">Roster — category visibility</legend>
        <p className="text-xs text-neutral-500 mb-3">
          Whether STAFF are restricted to seeing only their own category&apos;s roster entries (FOH sees FOH, BOH
          sees BOH), plus always-visible positions like Floor Manager. Not yet used by a live staff view — this
          sets the policy ahead of that page shipping.
        </p>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterRestrictFOHToOwnCategory" defaultChecked={settings.rosterRestrictFOHToOwnCategory} />
            Restrict FOH staff to FOH-only view
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="rosterRestrictBOHToOwnCategory" defaultChecked={settings.rosterRestrictBOHToOwnCategory} />
            Restrict BOH staff to BOH-only view
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
