"use client";

import { useActionState } from "react";
import { createLedgerCategory, type LedgerAdminActionState } from "@/lib/actions/ledger";
import { TextInput, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: LedgerAdminActionState = { error: null };

export function CategoryForm() {
  const [state, formAction, isPending] = useActionState(createLedgerCategory, initialState);
  const formRef = useKeepValuesOnError(isPending, !!state.error);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      {state.error && <Banner tone="danger" title="Couldn't add category" description={state.error} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <TextInput type="text" name="name" placeholder="New category name" required />
        </div>
        {/* P&L bucket (2026-08-16, Analytics/P&L feature) -- which line
            this category's dollars roll up into on the P&L. Defaults to
            Other, editable any time afterward from the list below. */}
        <div className="shrink-0 w-auto">
          <Select name="pnlGroup" defaultValue="OTHER_EXPENSE" className="!w-auto">
            <option value="FOOD">P&amp;L: Food</option>
            <option value="BEVERAGE_NONALC">P&amp;L: Drinks (non-alc)</option>
            <option value="BEVERAGE_ALC">P&amp;L: Bar (alcohol)</option>
            <option value="OTHER_EXPENSE">P&amp;L: Other expense</option>
            <option value="EXCLUDED">P&amp;L: Excluded</option>
          </Select>
        </div>
        <Button type="submit" loading={isPending} className="shrink-0">
          {isPending ? "Adding…" : "+ Add"}
        </Button>
      </div>
    </form>
  );
}
