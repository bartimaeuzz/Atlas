"use client";

import { startTransition, useActionState, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createShift, type CreateShiftState } from "@/lib/actions/shift";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";

const initialState: CreateShiftState = { error: null };

type RosterSource = "plan" | "fresh";

/** The month view's "+ Create" slot (2026-08-25, Oliver: with every day
 * on the grid the standalone /shifts/new form had nothing left to ask,
 * so it's gone -- "confirmation popup is the play"). Tapping the slot
 * opens ONE dialog per the quick-add gate convention: a plain create
 * confirm for today, the day-has-passed wording for a past day (the
 * gate is answered by this dialog, so the submit carries confirmPast).
 * Future days never render this component at all, and the server
 * refuses them regardless.
 *
 * When the published weekly plan has people for this slot, the same
 * dialog offers the choice (Oliver, later 2026-08-25: "creating shift
 * popup offer pull data from assignment or start fresh") -- "Pull from
 * schedule" seeds the roster from the plan as before, "Start fresh"
 * creates it empty. With no published plan there is no choice to offer
 * and the single Create button stays.
 *
 * The action redirects to the new shift's roster on success. If the
 * shift meanwhile exists (stale page, second terminal), the action
 * reports it and a second dialog offers to open it -- same
 * identity-dismissal pattern the old form used. */
export function CreateShiftSlot({
  date,
  period,
  isPast,
  plannedCount,
}: {
  date: string;
  period: "Lunch" | "Dinner";
  isPast: boolean;
  plannedCount: number;
}) {
  const [state, formAction, isPending] = useActionState(createShift, initialState);
  const router = useRouter();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Remembered so the midnight-edge pastConfirm resubmit (below) keeps
  // the source the manager already chose instead of silently reverting
  // to the default, and so only the tapped button shows its spinner.
  const [chosenSource, setChosenSource] = useState<RosterSource>("plan");
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

  function submit(source: RosterSource, confirmPast: boolean) {
    setChosenSource(source);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("period", period);
    fd.set("rosterSource", source);
    if (confirmPast) fd.set("confirmPast", "1");
    startTransition(() => formAction(fd));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] text-xs font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--hover)]"
      >
        + Create
      </button>

      <Modal open={open && !existing && !pastConfirm} onClose={() => setOpen(false)} labelledBy={titleId} initialFocus={cancelRef}>
        <div id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-1.5">
          {isPast ? "That day has already passed" : `Create ${period} shift?`}
        </div>
        <p className="text-sm text-[var(--ink-700)] mb-4">
          {isPast
            ? `${date} (${period}) is in the past. Create it only to backfill a shift that was missed.`
            : `${date} (${period}) — you'll build the roster next.`}
          {plannedCount > 0 &&
            ` The published schedule has ${plannedCount} ${plannedCount === 1 ? "person" : "people"} planned for this shift.`}
        </p>
        {state.error && (
          <div className="mb-4">
            <Banner tone="danger" title="Couldn't create the shift" description={state.error} />
          </div>
        )}
        {/* Buttons wrap on a phone -- three labels don't fit one 360px row. */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button ref={cancelRef} variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          {plannedCount > 0 ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => submit("fresh", isPast)} loading={isPending && chosenSource === "fresh"} disabled={isPending}>
                Start fresh
              </Button>
              <Button variant="primary" size="sm" onClick={() => submit("plan", isPast)} loading={isPending && chosenSource === "plan"} disabled={isPending}>
                Pull from schedule
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => submit("fresh", isPast)} loading={isPending}>
              {isPast ? "Create anyway" : "Create shift"}
            </Button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pastConfirm}
        onClose={() => {
          setDismissedPast(state.pastConfirm ?? null);
          setOpen(false);
        }}
        onConfirm={() => {
          if (!pastConfirm) return;
          setDismissedPast(state.pastConfirm ?? null);
          submit(chosenSource, true);
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
