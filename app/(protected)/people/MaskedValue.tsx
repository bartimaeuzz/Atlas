"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

/** Masked-by-default sensitive value with an eye toggle (2026-08-24,
 * Oliver: "need to mask SSN/ITIN even ADMIN visible / add eye icon to
 * reveal"). Capability decides whether the value reaches the browser at
 * all (the profile omits the whole HR section otherwise); this masking
 * is about shoulder surfing on a shared terminal, so it applies to
 * everyone — Admins included — and reveals only on an explicit tap. */
export function MaskedValue({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const last4 = value.replace(/\D/g, "").slice(-4);
  const masked = last4 ? `•••-••-${last4}` : "••••";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{revealed ? value : masked}</span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? "Hide" : "Reveal"}
        className="min-w-11 min-h-11 -my-3 flex items-center justify-center text-[var(--ink-500)] hover:text-[var(--ink-900)]"
      >
        {revealed ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
      </button>
    </span>
  );
}
