"use client";

import { useActionState } from "react";
import { setEmployeePin } from "@/lib/actions/employees";
import type { EmployeeActionState } from "@/lib/actions/employees";

const initialState: EmployeeActionState = { error: null };

/** Standalone PIN reset — deliberately separate from the main employee
 * edit form (see setEmployeePin's header comment in lib/actions/employees.ts
 * for why). Shows a quick success flash by keying off state changing to
 * {error: null} after a real submit — cheap way to give feedback without
 * a full redirect/revalidate round trip disrupting the edit page. */
export function SetPinForm({ employeeId, hasPinSet }: { employeeId: number; hasPinSet: boolean }) {
  const [state, formAction, isPending] = useActionState(setEmployeePin, initialState);

  return (
    <div className="border rounded p-4">
      <h2 className="text-sm font-medium mb-1">Staff login PIN</h2>
      <p className="text-xs text-neutral-500 mb-3">
        {hasPinSet
          ? "A PIN is already set — entering a new one below replaces it."
          : "No PIN set yet — this person can't sign in to their pay view until one is set."}
      </p>
      <form action={formAction} className="flex items-end gap-2">
        <input type="hidden" name="employeeId" value={employeeId} />
        <label className="text-sm flex-1">
          <span className="block text-neutral-500 mb-1">New PIN (4–8 digits)</span>
          <input
            type="password"
            inputMode="numeric"
            name="pin"
            required
            autoComplete="off"
            className="border rounded px-2 py-1 w-full tracking-widest"
            placeholder="••••"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 disabled:opacity-50 text-sm"
        >
          {isPending ? "Saving…" : hasPinSet ? "Reset PIN" : "Set PIN"}
        </button>
      </form>
      {state.error && <p className="text-red-600 text-xs mt-2">{state.error}</p>}
      {!state.error && !isPending && state !== initialState && (
        <p className="text-green-700 text-xs mt-2">PIN updated.</p>
      )}
    </div>
  );
}
