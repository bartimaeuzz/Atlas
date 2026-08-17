"use client";

import { useActionState } from "react";
import { redeemRecoveryCode, type RedeemRecoveryCodeState } from "@/lib/actions/recovery";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: RedeemRecoveryCodeState = { error: null, success: false };

export function RecoverForm({ employees }: { employees: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(redeemRecoveryCode, initialState);

  if (state.success) {
    return <Banner tone="success" title="PIN reset" description="Sign in with the new PIN from the sign-in page." />;
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Banner tone="danger" title="Couldn't reset" description={state.error} />}
      <TextInput
        type="text"
        name="code"
        required
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        label="Recovery code"
        className="tracking-[0.1em] uppercase font-mono"
      />
      <Select name="employeeId" required defaultValue="" label="Whose PIN are you resetting?">
        <option value="" disabled>
          Select a name…
        </option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </Select>
      <TextInput
        type="password"
        inputMode="numeric"
        name="pin"
        required
        autoComplete="off"
        placeholder="New PIN (4–8 digits)"
        label="New PIN"
        className="tracking-[0.2em]"
      />
      <TextInput
        type="password"
        inputMode="numeric"
        name="confirmPin"
        required
        autoComplete="off"
        placeholder="Confirm new PIN"
        label="Confirm new PIN"
        className="tracking-[0.2em]"
      />
      <Button type="submit" loading={isPending} className="w-full" size="md">
        {isPending ? "Resetting…" : "Reset PIN"}
      </Button>
    </form>
  );
}
