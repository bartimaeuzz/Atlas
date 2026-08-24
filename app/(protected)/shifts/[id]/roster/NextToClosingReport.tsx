"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** The roster page's Next button (2026-08-24, Oliver): when positions are
 * still under their target, moving on asks first — Cancel stays to fix
 * the roster, Proceed goes to the Closing Report. Warn, never block:
 * running short is sometimes just the day's reality. With nothing
 * understaffed this renders the plain link it always was. */
export function NextToClosingReport({
  shiftId,
  understaffed,
}: {
  shiftId: number;
  /** e.g. ["Server 1/2", "Host 0/1"] — computed server-side by the page. */
  understaffed: string[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const href = `/shifts/${shiftId}/closing-report`;

  if (understaffed.length === 0) {
    return <LinkButton href={href}>Next: Closing Report →</LinkButton>;
  }

  return (
    <>
      <Button type="button" onClick={() => setConfirming(true)}>
        Next: Closing Report →
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          router.push(href);
        }}
        title="Still understaffed — proceed?"
        description={`Below target: ${understaffed.join(", ")}. You can go fix the roster, or continue if that's how today is running.`}
        confirmLabel="Proceed"
      />
    </>
  );
}
