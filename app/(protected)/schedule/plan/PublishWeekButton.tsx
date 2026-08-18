"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishWeek } from "@/lib/actions/schedule";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Restyled onto the design system 2026-08-18 -- replaces a raw
 * `window.confirm()` with the app's real ConfirmDialog (the same
 * anti-pattern already found and fixed once in RosterGrid.tsx on
 * 2026-08-16; this file was one of two places that same bug had also
 * shipped, found during the live-code reconciliation for the 2026-08-18
 * UI pattern additions -- see project_atlas_ui_design memory). The
 * dialog description carries the consequence-disclosure text this button
 * already had in its old confirm() message: publishing changes
 * visibility for OTHER people (staff), so it earns the tier-2 disclosure
 * treatment -- seen before commit, not buried in a browser-native popup.
 * `variant="brand"` because Publish is one of the named
 * single-most-consequential-action-per-flow moments (2026-08-15 brand
 * identity decision), same tier as Confirm & Finalize. */
export function PublishWeekButton({ weekId }: { weekId: number }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)} disabled={isPending}>
        {isPending ? "Publishing…" : "Publish"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Publish this week?"
        description="It'll become visible to staff immediately and start auto-filling new shifts."
        confirmLabel="Publish"
        loading={isPending}
        onConfirm={() => {
          startTransition(async () => {
            await publishWeek(weekId);
            setOpen(false);
            router.refresh();
          });
        }}
      />
    </>
  );
}
