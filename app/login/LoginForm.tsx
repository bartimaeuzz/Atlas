"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { login, type LoginActionState } from "@/lib/actions/auth";
import { Checkbox, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const initialState: LoginActionState = { error: null };

export function LoginForm({
  employees,
  method,
}: {
  employees: { id: number; name: string }[];
  /** Which field this form renders — set per-restaurant in Settings ("Staff
   * login"), see app/login/page.tsx. */
  method: "NAME" | "ID";
}) {
  const [state, formAction, isPending] = useActionState(login, initialState);
  // 2026-09-01, found by the live audit: a wrong PIN used to blank the
  // NAME as well, which left a dead end — the red banner says "Wrong
  // PIN", focus sits in the PIN box, and retyping the PIN does nothing
  // at all, because the now-empty and genuinely `required` name select
  // fails validation silently. The browser's own "Please select an item
  // in the list" bubble points at a control above where the person is
  // looking while the loud red message points at the wrong field. On the
  // app's front door, for a low-computer-literacy user, that reads as
  // "the app is broken".
  //
  // The hook restores the name and deliberately does NOT restore the PIN
  // — a wrong credential must not sit in the box waiting to be
  // resubmitted by accident. Controlled state does NOT fix this: React
  // only writes a controlled value back to the DOM when the value
  // PROP changes, and after a refusal it has not, so the reset wins.
  const formRef = useKeepValuesOnError(isPending, !!state.error);
  // Put the cursor in the PIN box when a wrong PIN comes back (2026-09-01
  // visual audit: focus was landing on <body>). The banner says "try
  // again" and the hook has already cleared the field and kept the name,
  // so the only thing left to do is type — this saves the person hunting
  // for where. Runs only when the error changes, never on first paint.
  const pinRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.error) pinRef.current?.focus();
  }, [state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error && <Banner tone="danger" title="Couldn't sign in" description={state.error} announceKey={state} />}
      {method === "NAME" ? (
        <Select name="employeeId" required defaultValue="" label="Your name">
          <option value="" disabled>
            Select your name…
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          type="text"
          name="loginId"
          required
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="YK26081007"
          label="Login ID"
          className="tracking-[0.15em] uppercase"
        />
      )}
      <TextInput
        ref={pinRef}
        type="password"
        inputMode="numeric"
        name="pin"
        required
        autoComplete="off"
        placeholder="••••"
        label="PIN"
        className="tracking-[0.4em] text-lg text-center"
      />
      {/* 2026-09-01: 30-day sign-in for personal phones. Off by default —
       * the safe choice on a device other people use. Oliver chose the
       * familiar label ("keep me logged in") over a device-fact wording;
       * the helper line carries the shared-device warning. */}
      <Checkbox
        name="ownDevice"
        label={<span className="font-medium">Keep me logged in</span>}
        description="Stays signed in for 30 days. Leave this off on a device other people use."
      />
      <Button type="submit" loading={isPending} className="w-full" size="md">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-[var(--ink-500)]">
        {/* 2026-08-18 visual-audit fix: this link's clickable area measured
         * 77x19px live, failing WCAG 2.5.8's 24x24 floor on height —
         * TAP_TARGET_PAD expands the real hit box without changing how it
         * looks. See components/ui/touchTarget.ts. */}
        <Link href="/login/recover" className={`underline inline-block ${TAP_TARGET_PAD}`}>
          Forgot PIN?
        </Link>
      </p>
    </form>
  );
}
