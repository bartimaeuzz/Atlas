"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createShift, type CreateShiftState } from "@/lib/actions/shift";
import { TextInput, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const initialState: CreateShiftState = { error: null };

/** New-shift form (client since 2026-08-24, Oliver): submitting a
 * date+period that already exists used to silently open the existing
 * shift's roster, which read as "created" when nothing was. Now the
 * action reports it and this form asks -- Cancel stays here, "Go to
 * that shift" opens it (roster while draft, summary once finalized,
 * same rule the shifts list uses). */
export function NewShiftForm({ defaultDate, defaultPeriod }: { defaultDate: string; defaultPeriod: "Lunch" | "Dinner" }) {
  const [state, formAction, isPending] = useActionState(createShift, initialState);
  const router = useRouter();
  // Dismissal by object identity: every submit returns a fresh `existing`
  // object, so re-submitting the same duplicate reopens the dialog while
  // Cancel keeps THIS result closed. (Same lesson as the import screen's
  // parsedAt nonce -- action state outlives the UI that used it.)
  const [dismissed, setDismissed] = useState<CreateShiftState["existing"] | null>(null);
  const existing = state.existing && state.existing !== dismissed ? state.existing : undefined;

  return (
    <>
      <form action={formAction} className="space-y-4">
        {state.error && <Banner tone="danger" title="Couldn't create the shift" description={state.error} />}
        <TextInput type="date" name="date" defaultValue={defaultDate} required label="Date" />
        <Select name="period" required defaultValue={defaultPeriod} label="Period">
          <option value="Lunch">Lunch</option>
          <option value="Dinner">Dinner</option>
        </Select>
        <Button type="submit" className="w-full" loading={isPending}>
          {isPending ? "Creating…" : "Create shift & start roster"}
        </Button>
      </form>

      <ConfirmDialog
        open={!!existing}
        onClose={() => setDismissed(state.existing ?? null)}
        onConfirm={() => {
          if (!existing) return;
          router.push(existing.status === "finalized" ? `/shifts/${existing.id}/summary` : `/shifts/${existing.id}/roster`);
        }}
        title="That shift has already been created"
        description={
          existing ? `${existing.date} (${existing.period}) already exists${existing.status === "finalized" ? " and is finalized" : ""}. Nothing new was created.` : ""
        }
        confirmLabel="Go to that shift"
      />
    </>
  );
}
