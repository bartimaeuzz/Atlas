"use client";

import { useActionState, useState } from "react";
import { generateRecoveryCode, type GenerateRecoveryCodeState } from "@/lib/actions/recovery";
import type { RecoveryCodeStatus } from "@/lib/settings/loadRestaurantSettings";

const initialState: GenerateRecoveryCodeState = { error: null };

/** Admin-only "Account recovery" panel (2026-08-17, Oliver: "How do they
 * reset the admin password by themselves?" when Atlas has been shipped
 * to a customer with no way back to us). Generates the restaurant's
 * recovery code -- shown in plaintext exactly once here, then gone; only
 * a hash is ever stored (lib/actions/recovery.ts). Deliberately its own
 * component, not folded into the big SettingsForm submit -- the one-time
 * reveal needs its own state and shouldn't get lost in a page full of
 * unrelated fields, same reasoning SetPinForm split off from
 * EmployeeForm. */
export function RecoveryCodeSection({ status, viewerIsAdmin }: { status: RecoveryCodeStatus; viewerIsAdmin: boolean }) {
  const [state, formAction, isPending] = useActionState(generateRecoveryCode, initialState);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  if (!viewerIsAdmin) return null;

  return (
    <fieldset className="border rounded p-4">
      <legend className="text-sm font-medium px-1">Account recovery</legend>
      <p className="text-xs text-neutral-500 mb-3">
        A one-time code that can reset ANY employee&apos;s PIN from the &quot;Forgot PIN?&quot; link on the sign-in
        page -- the escape hatch for when the last Manager/Admin account is locked out and there&apos;s no one else
        to reset it for you. Generate this now, while everything is working, and store it somewhere safe (a safe,
        a locked drawer -- not a sticky note on the register).
      </p>

      {state.code ? (
        <div className="border border-green-300 bg-green-50 rounded p-3 mb-3">
          <p className="text-xs font-medium text-green-800 mb-1">
            Your new recovery code -- write this down now. It will not be shown again.
          </p>
          <p className="font-mono text-lg tracking-wider text-green-900">{state.code}</p>
        </div>
      ) : (
        <p className="text-xs text-neutral-600 mb-3">
          {status.isSet ? (
            <>
              A recovery code is set (generated {formatDate(status.setAt)}).{" "}
              {status.lastUsedAt ? (
                <>
                  Last used {formatDate(status.lastUsedAt)}
                  {status.lastUsedForEmployeeNickname ? ` to reset ${status.lastUsedForEmployeeNickname}'s PIN.` : "."}
                </>
              ) : (
                "Never used."
              )}
            </>
          ) : (
            "No recovery code has been generated yet -- there is currently no self-service way to recover a locked-out account."
          )}
        </p>
      )}

      {state.error && <p className="text-red-600 text-xs mb-2">{state.error}</p>}

      {status.isSet && !confirmingRegenerate && !state.code ? (
        <button
          type="button"
          onClick={() => setConfirmingRegenerate(true)}
          className="text-sm underline text-neutral-500 hover:text-neutral-800"
        >
          Regenerate recovery code
        </button>
      ) : (
        <form action={formAction}>
          {status.isSet && !state.code && (
            <p className="text-xs text-amber-700 mb-2">
              Generating a new code immediately invalidates the old one.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="bg-black text-white px-3 py-1.5 rounded hover:bg-neutral-800 disabled:opacity-50 text-sm"
            >
              {isPending ? "Generating…" : status.isSet ? "Regenerate recovery code" : "Generate recovery code"}
            </button>
            {status.isSet && !state.code && (
              <button
                type="button"
                onClick={() => setConfirmingRegenerate(false)}
                className="text-sm text-neutral-400 hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </fieldset>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}
