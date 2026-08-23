"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { stepHref } from "./StepNav";

/** Step 1's Next.
 *
 * A client component only so it can navigate; the step itself is URL state,
 * so there is nothing to hold. The typed-but-not-added warning Oliver and I
 * settled on belongs to the add-entry form (which owns that text), not
 * here — see AddEntryForm.
 */
export function NextButton({ date, seen, label }: { date: string; seen: number; label: string }) {
  const router = useRouter();
  return (
    <Button className="w-full" onClick={() => router.push(stepHref(date, 2, Math.max(seen, 2)))}>
      {label}
    </Button>
  );
}
