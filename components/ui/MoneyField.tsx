"use client";

import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef } from "react";
import { TextInput } from "./Field";
import { groupThousands, ungroupThousands, ungroupedOffset } from "@/lib/format/groupThousands";

/** A labelled dollar box that reads like every other dollar figure in the
 * app: `18,500`, not `18500` (2026-09-05, the money-comma rollout).
 *
 * `MoneyInput` next door is the bare input, for the two places that supply
 * their own label markup. This is the one to reach for anywhere a
 * `TextInput` is being replaced, because it keeps the label, hint, error
 * and required asterisk exactly as they were.
 *
 * ## Why the comma only appears when the field is not focused
 *
 * The obvious implementation — regroup on every keystroke — has to put the
 * caret back afterwards, and gets it wrong the moment somebody edits the
 * middle of a number. So nothing is reformatted while the field is in use:
 *
 *   not focused  →  shows the grouped form. This is the state a manager
 *                   reads the screen in, which is the whole request.
 *   focused      →  shows the plain digits. Typing, arrow keys, select-all
 *                   and backspace all behave like a plain number field.
 *
 * Taking the commas out is a `value` write, though, and that COLLAPSES the
 * selection — including the select-all a browser does when you TAB into a
 * text field. Left alone it meant tabbing into "18,500.75" and typing 9 gave
 * "18500.759" rather than "9", appending to a statement total the manager
 * believed they had replaced, with nothing on screen to show it (found in the
 * 2026-09-05 live audit; a plain text field beside it selected 0-5 where this
 * one reported 8-8). Both variants below therefore carry the selection across
 * the swap with `ungroupedOffset`.
 *
 * ## Why the parent's state never contains a comma
 *
 * `onValueChange` hands back the separator-stripped string, always. That is
 * deliberate and load-bearing: five of these fields feed live client-side
 * arithmetic (the split editor's remainder, the drawer's total cash in, the
 * finalize step's over/short banner), and those all read state with
 * `Number(...)`. If state carried the commas, every one of them would
 * quietly start computing NaN. Commas live in the DOM, never in state.
 *
 * A field that posts through FormData is the exception the parsers had to
 * be widened for — it posts what it DISPLAYS, which is grouped. See
 * lib/format/parseMoneyAmount.ts.
 *
 * ## Why type="text"
 *
 * `type="number"` silently discards a typed comma, which would turn 3,800
 * into an empty box in front of someone with no idea why. `inputMode
 * ="decimal"` keeps the numeric keypad on a phone, which is what the old
 * fields were really getting from `type="number"` anyway.
 *
 * The two guarantees `type="number"` did carry are not lost, they moved:
 * `step="0.01"` became the cents rounding in `parseMoneyAmount`, and `min`
 * was already duplicated by each action's own validation ("Amount must be
 * a positive number"), which is where the readable sentence lives.
 */

type Shared = Omit<
  ComponentPropsWithRef<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> & {
  label?: string;
  hint?: string;
  error?: string;
};

type ControlledProps = Shared & {
  /** The plain, separator-free number being edited. A `number` is accepted
   * for the callers that keep numeric state; it is stringified, never
   * locale-formatted, so nothing rounds on the way in. */
  value: string | number;
  /** Receives the separator-free string. Never a comma, by contract. */
  onValueChange: (next: string) => void;
  defaultValue?: undefined;
};

type UncontrolledProps = Shared & {
  value?: undefined;
  onValueChange?: undefined;
  /** The stored number, or null for an empty field. */
  defaultValue?: number | string | null;
};

export function MoneyField(props: ControlledProps | UncontrolledProps) {
  // Two components rather than two branches inside one, so neither can end
  // up calling a different number of hooks than the other.
  return props.value !== undefined ? (
    <ControlledMoneyField {...(props as ControlledProps)} />
  ) : (
    <UncontrolledMoneyField {...(props as UncontrolledProps)} />
  );
}

function ControlledMoneyField({ value, onValueChange, onFocus, onBlur, className = "", ...rest }: ControlledProps) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // Where the selection has to land once React has re-rendered the ungrouped
  // value. Read during the focus event, applied after the paint that removes
  // the commas — doing it in the handler would be undone by that render.
  const pendingSelection = useRef<[number, number] | null>(null);
  const raw = value == null ? "" : String(value);

  useLayoutEffect(() => {
    const range = pendingSelection.current;
    pendingSelection.current = null;
    if (!focused || !range || !ref.current) return;
    ref.current.setSelectionRange(range[0], range[1]);
  }, [focused]);

  return (
    <TextInput
      ref={ref}
      type="text"
      inputMode="decimal"
      value={focused ? raw : groupThousands(raw)}
      onChange={(e) => onValueChange(ungroupThousands(e.target.value))}
      onFocus={(e) => {
        const grouped = e.currentTarget.value;
        const start = e.currentTarget.selectionStart;
        const end = e.currentTarget.selectionEnd;
        pendingSelection.current =
          start == null || end == null
            ? null
            : [ungroupedOffset(grouped, start), ungroupedOffset(grouped, end)];
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
      // Alignment deliberately left alone: these are full-width form
      // fields, not a column of figures, and right-aligning a lone input
      // pushes the number away from its own label. tabular-nums only, so
      // the digits stop shifting as the comma appears and disappears.
      className={`tabular-nums ${className}`}
    />
  );
}

function UncontrolledMoneyField({ defaultValue, onFocus, onBlur, className = "", ...rest }: UncontrolledProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <TextInput
      ref={ref}
      type="text"
      inputMode="decimal"
      // String(), not toLocaleString(): the number becomes digits first and
      // is grouped as a string, so a stored 3,800.50 cannot come back 3,801
      // on the next unrelated save. See lib/format/groupThousands.ts.
      defaultValue={defaultValue == null ? "" : groupThousands(String(defaultValue))}
      onFocus={(e) => {
        const el = e.currentTarget;
        const grouped = el.value;
        const plain = ungroupThousands(grouped);
        if (plain !== grouped) {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          el.value = plain;
          if (start != null && end != null) {
            el.setSelectionRange(ungroupedOffset(grouped, start), ungroupedOffset(grouped, end));
          }
        }
        onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.value = groupThousands(e.currentTarget.value);
        onBlur?.(e);
      }}
      {...rest}
      className={`tabular-nums ${className}`}
    />
  );
}
