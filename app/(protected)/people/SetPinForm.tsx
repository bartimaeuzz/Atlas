"use client";

import { useActionState } from "react";
import { setEmployeePin } from "@/lib/actions/employees";
import type { EmployeeActionState } from "@/lib/actions/employees";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: EmployeeActionState = { error: null };

/** Standalone PIN reset — deliberately separate from the main employee
 * edit form (see setEmployeePin's header comment in lib/actions/employees.ts
 * for why). Shows a quick success flash by keying off state changing to
 * {error: null} after a real submit — cheap way to give feedback without
 * a full redirect/revalidate round trip disrupting the edit page. */
export function SetPinForm({ employeeId, hasPinSet }: { employeeId: number; hasPinSet: boolean }) {
  const [state, formAction, isPending] = useActionState(setEmployeePin, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  return (
    <Card>
      <h2 className="text-sm font-semibold text-[var(--ink-900)] mb-1">Staff login PIN</h2>
      <p className="text-xs text-[var(--ink-500)] mb-3">
        {hasPinSet
          ? "A PIN is already set — entering a new one below replaces it."
          : "No PIN set yet — this person can't sign in to their pay view until one is set."}
      </p>
      <form ref={formRef} action={formAction} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <input type="hidden" name="employeeId" value={employeeId} />
        <div className="flex-1">
          <TextInput
            type="password"
            inputMode="numeric"
            name="pin"
            label="New PIN (4–8 digits)"
            required
            autoComplete="off"
            className="tracking-widest"
            placeholder="••••"
          />
        </div>
        <Button type="submit" loading={isPending}>
          {isPending ? "Saving…" : hasPinSet ? "Reset PIN" : "Set PIN"}
        </Button>
      </form>
      {state.error && (
        <div className="mt-3">
          <Banner tone="danger" title="Couldn't save PIN" description={state.error} />
        </div>
      )}
      {!state.error && !isPending && state !== initialState && (
        <div className="mt-3">
          <Banner tone="success" title="PIN updated." />
        </div>
      )}
    </Card>
  );
}
