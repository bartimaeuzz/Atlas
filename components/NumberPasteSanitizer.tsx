"use client";

import { useEffect } from "react";

/** Cleans what managers paste into ANY numeric field, app-wide
 * (2026-08-31, Aey's run-through: "some manager copy number from toast
 * app including $ sign. we should alert or just filter copied and paste
 * to allow only number").
 *
 * A number input given a pasted "$1,234.56" either silently drops the
 * paste or sits in the badInput state — the manager sees nothing land
 * and doesn't know why. Error prevention beats an error message here:
 * strip currency signs, commas, and spaces and insert the number they
 * plainly meant. Only when the cleaned text still isn't a number does
 * nothing get inserted — and the globals.css :invalid ring covers the
 * ways a field can still go bad after that.
 *
 * One document-level listener instead of a per-field component on
 * purpose: every `<input type="number">` in the app — 16 files today,
 * and every one added tomorrow — gets the behaviour with zero per-form
 * wiring, and there is no second copy to forget (the silent-miss class
 * this repo keeps meeting). The native value setter + an `input` event
 * is what makes React controlled fields see the change as if typed.
 *
 * Whole-value replace, deliberately: the real gesture is "copy the
 * figure from Toast, paste it into the box". Splicing the clipboard into
 * a caret position inside an existing number is not a gesture anyone
 * performs on purpose with money figures, and number inputs don't expose
 * a caret to splice at anyway. */
export function NumberPasteSanitizer() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
      const raw = e.clipboardData?.getData("text") ?? "";
      // Strip everything that isn't a digit, a decimal point, or a
      // leading minus. Covers "$1,234.56", "1 234,56"-style thousand
      // spaces, and stray currency words; "(45.00)" accounting negatives
      // become plain 45.00 — this app never pastes negative money.
      const cleaned = raw.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
      if (cleaned === raw.trim()) return; // already clean — let the browser paste normally
      e.preventDefault();
      if (cleaned === "" || Number.isNaN(Number(cleaned))) return; // nothing numeric to insert
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(target, cleaned);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, []);
  return null;
}
