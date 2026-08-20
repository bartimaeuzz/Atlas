"use client";

import { useState, useTransition } from "react";
import { toggleEmployeeActive } from "@/lib/actions/employees";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

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
        className={`underline text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] disabled:opacity-50 ${TAP_TARGET_PAD}`}
      >
        {isPending ? "…" : active ? "Retire" : "Reactivate"}
      </button>
      {error && <span className="block text-xs text-[var(--danger)] mt-1 max-w-[16rem] text-right">{error}</span>}
    </span>
  );
}
