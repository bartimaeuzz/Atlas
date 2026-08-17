"use client";

import { useState, useTransition } from "react";
import { toggleEmployeeActive } from "@/lib/actions/employees";

export function EmployeeToggleActiveButton({ employeeId, active }: { employeeId: number; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await toggleEmployeeActive(employeeId, !active);
            if (result.error) setError(result.error);
          })
        }
        className="underline text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
      >
        {isPending ? "…" : active ? "Retire" : "Reactivate"}
      </button>
      {error && <span className="block text-xs text-red-600 mt-1 max-w-[16rem] text-right">{error}</span>}
    </span>
  );
}
