"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type LoginActionState } from "@/lib/actions/auth";
import { Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

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

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Banner tone="danger" title="Couldn't sign in" description={state.error} />}
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
        type="password"
        inputMode="numeric"
        name="pin"
        required
        autoComplete="off"
        placeholder="••••"
        label="PIN"
        className="tracking-[0.4em] text-lg text-center"
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
