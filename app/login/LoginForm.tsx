"use client";

import { useActionState } from "react";
import { login, type LoginActionState } from "@/lib/actions/auth";

const initialState: LoginActionState = { error: null };

export function LoginForm({ employees }: { employees: { id: number; name: string }[] }) {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm">{state.error}</div>
      )}
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">Your name</span>
        <select name="employeeId" required className="border rounded px-2 py-2 w-full" defaultValue="">
          <option value="" disabled>
            Select your name…
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="block text-neutral-500 mb-1">PIN</span>
        <input
          type="password"
          inputMode="numeric"
          name="pin"
          required
          autoComplete="off"
          className="border rounded px-2 py-2 w-full tracking-widest text-lg"
          placeholder="••••"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 disabled:opacity-50 w-full"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
