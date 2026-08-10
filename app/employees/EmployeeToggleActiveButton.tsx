"use client";

import { useTransition } from "react";
import { toggleEmployeeActive } from "@/lib/actions/employees";

export function EmployeeToggleActiveButton({ employeeId, active }: { employeeId: number; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleEmployeeActive(employeeId, !active))}
      className="underline text-sm text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
    >
      {isPending ? "…" : active ? "Retire" : "Reactivate"}
    </button>
  );
}
