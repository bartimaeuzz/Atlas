"use client";

import { useCallback, useEffect, useRef } from "react";

/** Keeps what the user typed or chose when a form action comes back with
 * an error (2026-09-01, Oliver's standing rule: after a refusal the
 * selections you already made are still there and you fix only the thing
 * that was wrong).
 *
 * The problem it solves: React 19 resets a form's UNCONTROLLED fields
 * once its action completes — including when the action returns an error
 * rather than succeeding. So the manager who mistyped one figure gets the
 * whole form handed back blank, or reset to the values it loaded with,
 * and has to redo work the app never told them was gone. It is invisible
 * to tsc, lint, build and happy-path testing, because it only appears on
 * submit → refusal → look.
 *
 * Why this and not controlled state everywhere: converting every field of
 * every long form by hand is a large diff across money-carrying screens,
 * and a hand conversion silently misses whichever field the author
 * overlooked. This restores the form as a whole, so it cannot miss one.
 * Forms that already hold controlled state are unaffected — their values
 * were never lost, and writing an identical value back is a no-op.
 *
 * What it deliberately does NOT restore:
 *   - password fields. A wrong PIN must not sit in the box waiting to be
 *     resubmitted by accident; the person retypes it. (This is exactly
 *     what app/login/LoginForm.tsx needs — the name back and the PIN
 *     gone — so since 2026-09-01 it uses this hook too.)
 *   - file inputs, which cannot be assigned programmatically at all.
 *   - hidden fields, which the server sets and the user never touches.
 *
 * Usage:
 *   const [state, formAction, isPending] = useActionState(save, initial);
 *   const formRef = useKeepValuesOnError(isPending, !!state.error);
 *   return <form ref={formRef} action={formAction}>…</form>;
 *
 * Keyed on `isPending` flipping back to false rather than on the error
 * text, deliberately: two submissions can produce the SAME message, and
 * an effect keyed on the message would not fire the second time.
 *
 * If a future React changes when the reset happens relative to effects,
 * this stops restoring and the form behaves exactly as it does today —
 * it degrades to the old bug, never to something worse.
 */
export function useKeepValuesOnError(isPending: boolean, hasError: boolean) {
  const formEl = useRef<HTMLFormElement | null>(null);
  const snapshot = useRef<{ value: string; checked: boolean }[] | null>(null);

  // A callback ref rather than a plain one, and this matters: the closing
  // report keys its <form> on the save nonce, so the element is REPLACED
  // after every successful save. A listener attached once on mount would
  // stay bound to the detached node and quietly stop snapshotting from
  // the second save onward. A callback ref re-runs on every node change
  // (React 19 honours the cleanup it returns), so the listener always
  // belongs to the form currently on screen.
  //
  // The snapshot is taken in the capture phase, before anything
  // downstream can change the fields.
  const formRef = useCallback((node: HTMLFormElement | null) => {
    formEl.current = node;
    if (!node) return;
    const capture = () => {
      snapshot.current = Array.from(node.elements).map((el) => {
        const field = el as HTMLInputElement;
        return { value: field.value ?? "", checked: !!field.checked };
      });
    };
    node.addEventListener("submit", capture, true);
    return () => {
      node.removeEventListener("submit", capture, true);
      if (formEl.current === node) formEl.current = null;
    };
  }, []);

  useEffect(() => {
    if (isPending) return; // still in flight; nothing has been reset yet
    const form = formEl.current;
    const saved = snapshot.current;
    if (!form || !saved || !hasError) return;

    const fields = Array.from(form.elements);
    // A length change means the form re-rendered into a different shape
    // (a branch opened, a row appeared) and index-matching would put
    // values in the wrong boxes. Restoring nothing beats restoring wrong.
    if (fields.length !== saved.length) return;

    fields.forEach((el, i) => {
      const field = el as HTMLInputElement;
      if (field.type === "password" || field.type === "file" || field.type === "hidden") return;
      if (field.type === "checkbox" || field.type === "radio") {
        if (field.checked !== saved[i].checked) field.checked = saved[i].checked;
      } else if (field.value !== saved[i].value) {
        field.value = saved[i].value;
      }
    });
    // Deps are the two things that decide whether a restore is due.
    // Typing does not re-run this, so a restore can never land on top of
    // what the user has since retyped.
  }, [isPending, hasError]);

  return formRef;
}
