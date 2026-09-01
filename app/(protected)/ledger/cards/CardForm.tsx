"use client";

import { useActionState } from "react";
import { createLedgerCard, type CardActionState } from "@/lib/actions/card";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: CardActionState = { error: null };

export function CardForm() {
  const [state, formAction, isPending] = useActionState(createLedgerCard, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {state.error && <Banner tone="danger" title="Couldn't add card" description={state.error} />}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextInput type="text" name="name" placeholder='New card name, e.g. "Amex ...1234"' required />
        </div>
        <Button type="submit" loading={isPending} className="shrink-0">
          {isPending ? "Adding…" : "+ Add"}
        </Button>
      </div>
    </form>
  );
}
