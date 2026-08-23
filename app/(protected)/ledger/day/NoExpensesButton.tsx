"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";
import { stepHref } from "./StepNav";

/** "No petty cash spent today" (2026-08-22, Oliver asked for both an
 * explicit control AND a confirmation).
 *
 * On a quiet day there is genuinely nothing to log, and tapping Next past
 * an empty form works but says nothing — the empty day is indistinguishable
 * from a day someone forgot. This makes it a stated fact instead, and step
 * 3's summary then reads "No expenses logged today" rather than showing a
 * blank.
 *
 * It deliberately writes NOTHING. There is no "declared empty" flag to keep
 * in sync with reality: zero expenses is already a fact the data carries,
 * so a column recording that someone said so could only ever disagree with
 * it. The confirmation exists to make the manager pause, not to record that
 * they did.
 */
export function NoExpensesButton({ date, seen }: { date: string; seen: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        No petty cash spent today
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.push(stepHref(date, 2, Math.max(seen, 2)));
        }}
        title="Nothing spent from the drawer today?"
        description="You can still come back and add an expense before the day is finalized."
        confirmLabel="Yes, nothing spent"
      />
    </>
  );
}
