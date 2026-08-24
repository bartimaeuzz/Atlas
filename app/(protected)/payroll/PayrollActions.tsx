"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayrollPeriodPaid, revertPayrollPeriodToDraft } from "@/lib/actions/payroll";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";

/** Restyled onto the design system 2026-08-18 -- replaces two raw
 * `window.confirm()` calls (plus hardcoded black/border button styling)
 * with the app's real ConfirmDialog, same fix already applied to
 * PublishWeekButton.tsx and RosterGrid.tsx for the same anti-pattern.
 * ConfirmDialog (not DangerConfirmDialog) is the right tier for both
 * actions here -- neither is truly irreversible: Mark Paid has an
 * explicit Admin-only Revert-to-draft path right below it, and Revert
 * itself just moves the record back a step, it doesn't delete anything.
 * DangerConfirmDialog's typed-word confirm is reserved for actions with
 * no way back at all (delete a shift/employee, wipe a report). */
export function MarkPaidButton({ weekStartDate, disabled }: { weekStartDate: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <Button
        variant="primary"
        size="sm"
        disabled={disabled || isPending}
        title={disabled ? "Finalize every shift this week first" : undefined}
        onClick={() => setOpen(true)}
      >
        {isPending ? "Marking paid…" : "Mark this week paid"}
      </Button>
      {/* 2026-08-18 visual-audit fix: was hover-title-only, invisible on
       * touch. title= kept as a free desktop-hover bonus. */}
      {disabled && <p className="text-xs text-[var(--ink-500)] mt-1.5">Finalize every shift this week first.</p>}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Mark this week's payroll as paid?"
        description="This locks the numbers as a permanent record. An Admin can revert it back to draft afterward if a correction is needed."
        confirmLabel="Mark paid"
        loading={isPending}
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            // Return-value error -- thrown server-action errors get redacted
            // to "Minified React error #441" in production (2026-08-24 sweep).
            const result = await markPayrollPeriodPaid(weekStartDate);
            setOpen(false);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
      />
      {error && (
        <div className="mt-2">
          <Banner tone="danger" title="Couldn't mark this week paid" description={error} />
        </div>
      )}
    </div>
  );
}

export function RevertToDraftButton({ weekStartDate }: { weekStartDate: string }) {
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <Button variant="secondary" size="sm" disabled={isPending} onClick={() => setOpen(true)}>
        {isPending ? "Reverting…" : "Revert to draft (Admin)"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Revert this week to draft?"
        description="Lets the numbers be corrected. This is an Admin-only action."
        confirmLabel="Revert to draft"
        loading={isPending}
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const result = await revertPayrollPeriodToDraft(weekStartDate);
            setOpen(false);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
      />
      {error && (
        <div className="mt-2">
          <Banner tone="danger" title="Couldn't revert this week" description={error} />
        </div>
      )}
    </div>
  );
}
