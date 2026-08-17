"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPayrollPeriodPaid, revertPayrollPeriodToDraft } from "@/lib/actions/payroll";

export function MarkPaidButton({ weekStartDate, disabled }: { weekStartDate: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={disabled || isPending}
        title={disabled ? "Finalize every shift this week first" : undefined}
        onClick={() => {
          if (!confirm("Mark this week's payroll as paid? This locks the numbers as a permanent record.")) return;
          setError(null);
          startTransition(async () => {
            try {
              await markPayrollPeriodPaid(weekStartDate);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't mark this week paid.");
            }
          });
        }}
        className="px-4 py-2 rounded bg-black text-white text-sm hover:bg-neutral-800 disabled:opacity-50"
      >
        {isPending ? "Marking paid…" : "Mark this week paid"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export function RevertToDraftButton({ weekStartDate }: { weekStartDate: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Revert this paid week back to draft so it can be corrected? (Admin only)")) return;
          setError(null);
          startTransition(async () => {
            try {
              await revertPayrollPeriodToDraft(weekStartDate);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't revert this week.");
            }
          });
        }}
        className="px-4 py-2 rounded border text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
      >
        {isPending ? "Reverting…" : "Revert to draft (Admin)"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
