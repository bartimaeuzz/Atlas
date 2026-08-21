"use client";

import { useActionState, useState } from "react";
import { createPosition, updatePosition, type PositionActionState } from "@/lib/actions/positions";
import type { PositionListRow, TipPoolGroup } from "@/lib/positions/loadPositionsList";

const initialState: PositionActionState = { error: null };

const POOL_OPTIONS: { value: TipPoolGroup; label: string; hint: string }[] = [
  { value: "POOL_1_DINE_IN", label: "Pool 1 — Dine-in", hint: "Server, Runner, Bartender, Host, Busser" },
  { value: "POOL_2_TAKEOUT_ONLINE", label: "Pool 2 — Takeout / online", hint: "Host, Operator, Packer, Bag Handler" },
  { value: "POOL_3_DELIVERY", label: "Pool 3 — Delivery", hint: "Delivery Guy (equal split, not point-weighted)" },
];

/** canEditPools (2026-08-21, Phase C re-review): tip pool membership is
 * the same positionTipPools data the /settings/tip-pools board writes,
 * and that board is Admin+Partner-only via TIP_POOL_STRUCTURE_EDIT. The
 * server action now enforces the same rule here; these checkboxes are
 * disabled to match, so a Floor Manager isn't offered a control that
 * fails on submit. Everything else on this form stays editable. */
export function PositionForm({
  existing,
  canEditPools,
}: {
  existing: PositionListRow | null;
  canEditPools: boolean;
}) {
  const action = existing ? updatePosition : createPosition;
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [category, setCategory] = useState<"FOH" | "BOH">(existing?.category ?? "FOH");

  const rateFor = (period: "Lunch" | "Dinner") => existing?.shiftRates.find((r) => r.period === period)?.flatRate;

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      {existing && <input type="hidden" name="positionId" value={existing.id} />}

      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm whitespace-pre-line">
          <div className="font-medium mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          name="name"
          defaultValue={existing?.name}
          required
          className="border rounded px-3 py-2 text-sm w-full"
          placeholder="e.g. Server, Line Cook"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Category</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="category"
              value="FOH"
              checked={category === "FOH"}
              onChange={() => setCategory("FOH")}
            />
            FOH (front of house)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="category"
              value="BOH"
              checked={category === "BOH"}
              onChange={() => setCategory("BOH")}
            />
            BOH (back of house)
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Default tip point value</label>
        <input
          type="number"
          step="0.1"
          name="defaultTipPointValue"
          defaultValue={existing?.defaultTipPointValue ?? ""}
          className="border rounded px-3 py-2 text-sm w-32"
          placeholder="1.0"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Template only — suggested starting point shown when adding someone to a roster in this
          position. Doesn&apos;t affect any calculation directly; leave blank for positions with no
          tip pool (e.g. Manager, Chef).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Tip pool membership</label>
        <div className="space-y-2">
          {POOL_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="tipPoolGroups"
                value={opt.value}
                defaultChecked={existing?.tipPoolGroups.includes(opt.value) ?? false}
                disabled={!canEditPools}
                className="mt-0.5 disabled:cursor-not-allowed"
              />
              <span>
                <span className="font-medium">{opt.label}</span>
                <span className="text-neutral-500"> — {opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          {canEditPools
            ? "A position with no boxes checked is in no tip pool at all (e.g. Manager, Chef). A position can belong to more than one pool — Host is the reason this exists."
            : "Which pools a position belongs to is set by an admin or partner. Everything else on this form is yours to edit."}
        </p>
      </div>

      {category === "FOH" && (
        <div>
          <label className="block text-sm font-medium mb-2">Flat wage rate</label>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Lunch</label>
              <input
                type="number"
                step="0.01"
                name="shiftRate_Lunch"
                defaultValue={rateFor("Lunch") ?? ""}
                className="border rounded px-3 py-2 text-sm w-28"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Dinner</label>
              <input
                type="number"
                step="0.01"
                name="shiftRate_Dinner"
                defaultValue={rateFor("Dinner") ?? ""}
                className="border rounded px-3 py-2 text-sm w-28"
                placeholder="0.00"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Shared by everyone who works this position — this is the whole point of a raise going
            here: change it once and it applies to whoever&apos;s rostered next. Leave a period
            blank if this position doesn&apos;t work that period.
          </p>
        </div>
      )}

      {category === "BOH" && (
        <p className="text-xs text-neutral-500 border rounded p-3 bg-neutral-50">
          BOH wage is set per employee, not per position — there&apos;s no admin UI for that yet.
          For now, a raise for a specific BOH person still needs to go through Claude directly.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Visibility</label>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="alwaysVisibleInRoster"
              defaultChecked={existing?.alwaysVisibleInRoster ?? false}
              className="mt-0.5"
            />
            <span>
              Always visible in roster — staff outside this category (FOH/BOH) can still see who
              worked this position (e.g. Manager, Floor Manager, so everyone can see who&apos;s
              running the shift).
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="earningsHiddenFromStaff"
              defaultChecked={existing?.earningsHiddenFromStaff ?? false}
              className="mt-0.5"
            />
            <span>
              Hide earnings from other staff — no one except MANAGER/ADMIN and the person
              themself ever sees this position&apos;s pay, regardless of the FOH/BOH peer-earnings
              settings (e.g. leadership roles).
            </span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : existing ? "Save changes" : "Create position"}
      </button>
    </form>
  );
}
