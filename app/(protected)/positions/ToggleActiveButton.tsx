"use client";

import { useTransition } from "react";
import { togglePositionActive } from "@/lib/actions/positions";

export function ToggleActiveButton({ positionId, active }: { positionId: number; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => togglePositionActive(positionId, !active))}
      className="underline text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
    >
      {isPending ? "…" : active ? "Retire" : "Reactivate"}
    </button>
  );
}
