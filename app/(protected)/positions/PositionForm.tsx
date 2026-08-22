"use client";

import { useActionState, useState } from "react";
import { createPosition, updatePosition, type PositionActionState } from "@/lib/actions/positions";
import type { PositionListRow, TipPoolGroup } from "@/lib/positions/loadPositionsList";
import { Button, TextInput, Checkbox, Radio, Banner, Card } from "@/components/ui";

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
        <Banner
          tone="danger"
          title="Couldn't save."
          description={<span className="whitespace-pre-line">{state.error}</span>}
        />
      )}

      <TextInput
        label="Name"
        type="text"
        name="name"
        defaultValue={existing?.name}
        required
        placeholder="e.g. Server, Line Cook"
      />

      <fieldset>
        <legend className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">Category</legend>
        <div className="flex flex-wrap gap-x-6">
          <Radio
            name="category"
            value="FOH"
            checked={category === "FOH"}
            onChange={() => setCategory("FOH")}
            label="FOH (front of house)"
          />
          <Radio
            name="category"
            value="BOH"
            checked={category === "BOH"}
            onChange={() => setCategory("BOH")}
            label="BOH (back of house)"
          />
        </div>
      </fieldset>

      <TextInput
        label="Default tip point value"
        type="number"
        step="0.1"
        name="defaultTipPointValue"
        defaultValue={existing?.defaultTipPointValue ?? ""}
        placeholder="1.0"
        className="max-w-40"
        hint="Template only — suggested starting point shown when adding someone to a roster in this position. Doesn't affect any calculation directly; leave blank for positions with no tip pool (e.g. Manager, Chef)."
      />

      <fieldset>
        <legend className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">Tip pool membership</legend>
        <div>
          {POOL_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.value}
              name="tipPoolGroups"
              value={opt.value}
              defaultChecked={existing?.tipPoolGroups.includes(opt.value) ?? false}
              disabled={!canEditPools}
              label={<span className="font-medium">{opt.label}</span>}
              description={opt.hint}
            />
          ))}
        </div>
        <p className="text-xs text-[var(--ink-500)] mt-1.5">
          {canEditPools
            ? "A position with no boxes checked is in no tip pool at all (e.g. Manager, Chef). A position can belong to more than one pool — Host is the reason this exists."
            : "Which pools a position belongs to is set by an admin or partner. Everything else on this form is yours to edit."}
        </p>
      </fieldset>

      {category === "FOH" && (
        <fieldset>
          <legend className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">Flat wage rate</legend>
          <div className="flex flex-wrap gap-4">
            <TextInput
              label="Lunch"
              type="number"
              step="0.01"
              name="shiftRate_Lunch"
              defaultValue={rateFor("Lunch") ?? ""}
              placeholder="0.00"
              className="max-w-32"
            />
            <TextInput
              label="Dinner"
              type="number"
              step="0.01"
              name="shiftRate_Dinner"
              defaultValue={rateFor("Dinner") ?? ""}
              placeholder="0.00"
              className="max-w-32"
            />
          </div>
          <p className="text-xs text-[var(--ink-500)] mt-1.5">
            Shared by everyone who works this position — this is the whole point of a raise going
            here: change it once and it applies to whoever&apos;s rostered next. Leave a period
            blank if this position doesn&apos;t work that period.
          </p>
        </fieldset>
      )}

      {category === "BOH" && (
        <Card className="!p-4">
          <p className="text-xs text-[var(--ink-500)]">
            BOH wage is set per employee, not per position — there&apos;s no admin UI for that yet.
            For now, a raise for a specific BOH person still needs to go through Claude directly.
          </p>
        </Card>
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">Visibility</legend>
        <Checkbox
          name="alwaysVisibleInRoster"
          defaultChecked={existing?.alwaysVisibleInRoster ?? false}
          label="Always visible in roster"
          description="Staff outside this category (FOH/BOH) can still see who worked this position (e.g. Manager, Floor Manager, so everyone can see who's running the shift)."
        />
        <Checkbox
          name="earningsHiddenFromStaff"
          defaultChecked={existing?.earningsHiddenFromStaff ?? false}
          label="Hide earnings from other staff"
          description="No one except MANAGER/ADMIN and the person themself ever sees this position's pay, regardless of the FOH/BOH peer-earnings settings (e.g. leadership roles)."
        />
      </fieldset>

      <Button type="submit" loading={isPending}>
        {isPending ? "Saving…" : existing ? "Save changes" : "Create position"}
      </Button>
    </form>
  );
}
