"use client";

import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createShift, type CreateShiftState } from "@/lib/actions/shift";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const initialState: CreateShiftState = { error: null };

/** The month view's "+ Create" slot (2026-08-25, Oliver: with every day
 * on the grid the standalone /shifts/new form had nothing left to ask,
 * so it's gone -- "confirmation popup is the play"). Tapping the slot
 * opens ONE dialog per the quick-add gate convention: a plain create
 * confirm for today, the day-has-passed wording for a past day (the
 * gate is answered by this dialog, so the submit carries confirmPast).
 * Future days never render this component at all, and the server
 * refuses them regardless.
 *
 * The action redirects to the new shift's roster on success. If the
 * shift meanwhile exists (stale page, second terminal), the action
 * reports it and a second dialog offers to open it -- same
 * identity-dismissal pattern the old form used. */
export function CreateShiftSlot({ date, period, isPast }: { date: string; period: "Lunch" | "Dinner"; isPast: boolean }) {
  const [state, formAction, isPending] = useActionState(createShift, initialState);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Dismissal by object identity: every submit returns a fresh `existing`
  // object, so a re-tap reopens the dialog while Cancel keeps THIS result
  // closed. (Action state outlives the UI that used it.)
  const [dismissed, setDismissed] = useState<CreateShiftState["existing"] | null>(null);
  const existing = state.existing && state.existing !== dismissed ? state.existing : undefined;
  // A slot rendered as "today" turns into a past day if the page sits
  // open across midnight -- the server then answers pastConfirm instead
  // of creating. Without this the tap would look like it did nothing.
  const [dismissedPast, setDismissedPast] = useState<CreateShiftState["pastConfirm"] | null>(null);
  const pastConfirm = state.pastConfirm && state.pastConfirm !== dismissedPast ? state.pastConfirm : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] text-xs font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)]"
      >
        + Create
      </button>

      <ConfirmDialog
        open={open && !existing && !pastConfirm}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("date", date);
          fd.set("period", period);
          if (isPast) fd.set("confirmPast", "1");
          startTransition(() => formAction(fd));
        }}
        title={isPast ? "That day has already passed" : `Create ${period} shift?`}
        description={
          isPast
            ? `${date} (${period}) is in the past. Create it only to backfill a shift that was missed.`
            : `${date} (${period}) — you'll build the roster next.`
        }
        confirmLabel={isPast ? "Create anyway" : "Create shift"}
        loading={isPending}
        body={state.error ? <Banner tone="danger" title="Couldn't create the shift" description={state.error} /> : undefined}
      />

      <ConfirmDialog
        open={!!pastConfirm}
        onClose={() => {
          setDismissedPast(state.pastConfirm ?? null);
          setOpen(false);
        }}
        onConfirm={() => {
          if (!pastConfirm) return;
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

      <ConfirmDialog
        open={!!existing}
        onClose={() => {
          setDismissed(state.existing ?? null);
          setOpen(false);
        }}
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
