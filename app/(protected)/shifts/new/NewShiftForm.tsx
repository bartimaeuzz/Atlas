"use client";

import { startTransition, useActionState, useState } from "react";
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
 * same rule the shifts list uses).
 *
 * Since 2026-08-25 (Oliver): future dates are blocked (the date input
 * is capped at today; the action refuses server-side either way), and a
 * past date asks first before creating -- backfilling a missed record
 * is legitimate but rare enough that a silent create would more often
 * be a mistyped date. */
export function NewShiftForm({ defaultDate, defaultPeriod, maxDate }: { defaultDate: string; defaultPeriod: "Lunch" | "Dinner"; maxDate: string }) {
  const [state, formAction, isPending] = useActionState(createShift, initialState);
  const router = useRouter();
  // Dismissal by object identity: every submit returns a fresh `existing`
  // object, so re-submitting the same duplicate reopens the dialog while
  // Cancel keeps THIS result closed. (Same lesson as the import screen's
  // parsedAt nonce -- action state outlives the UI that used it.)
  const [dismissed, setDismissed] = useState<CreateShiftState["existing"] | null>(null);
  const existing = state.existing && state.existing !== dismissed ? state.existing : undefined;
  // Same identity-dismissal pattern for the past-day gate.
  const [dismissedPast, setDismissedPast] = useState<CreateShiftState["pastConfirm"] | null>(null);
  const pastConfirm = state.pastConfirm && state.pastConfirm !== dismissedPast ? state.pastConfirm : undefined;

  return (
    <>
      <form action={formAction} className="space-y-4">
        {state.error && <Banner tone="danger" title="Couldn't create the shift" description={state.error} />}
        <TextInput type="date" name="date" defaultValue={defaultDate} max={maxDate} required label="Date" hint="Today or a past day — a day that hasn't happened yet has nothing to record." />
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

      <ConfirmDialog
        open={!!pastConfirm}
        onClose={() => setDismissedPast(state.pastConfirm ?? null)}
        onConfirm={() => {
          if (!pastConfirm) return;
          // Re-submit the same date+period with the gate answered. The
          // action re-checks everything (auth, duplicate) on this pass too.
          const fd = new FormData();
          fd.set("date", pastConfirm.date);
          fd.set("period", pastConfirm.period);
          fd.set("confirmPast", "1");
          setDismissedPast(state.pastConfirm ?? null);
          startTransition(() => formAction(fd));
        }}
        title="That day has already passed"
        description={pastConfirm ? `${pastConfirm.date} (${pastConfirm.period}) is in the past. Create it only to backfill a shift that was missed.` : ""}
        confirmLabel="Create anyway"
        loading={isPending}
      />
    </>
  );
}
