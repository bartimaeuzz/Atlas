import type { ComponentPropsWithRef, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
import { AlertCircleIcon } from "./icons";

const fieldShell =
  "w-full box-border min-w-0 border rounded-[var(--radius-md)] px-3 py-2.5 text-base bg-[var(--card)] text-[var(--ink-900)] min-h-11 " +
  "focus:border-[var(--primary)] " +
  "disabled:bg-[var(--paper)] disabled:text-[var(--ink-500)]";

function fieldBorder(error?: boolean) {
  return error ? "border-[var(--danger)]" : "border-[var(--border-strong)]";
}

interface WrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

function FieldWrapper({ label, hint, error, required, children }: WrapperProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-[var(--ink-700)] mb-1.5">
          {label}
          {required && <span className="text-[var(--danger)]"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <div className="flex items-start gap-1.5 mt-1.5">
          <AlertCircleIcon className="text-[var(--danger)] mt-0.5 shrink-0" width={14} height={14} />
          <span className="text-xs text-[var(--danger)]">{error}</span>
        </div>
      ) : hint ? (
        <p className="text-xs text-[var(--ink-500)] mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}

/** ComponentPropsWithRef, not InputHTMLAttributes: React 19 makes `ref` an
 * ordinary prop (no forwardRef), but the attribute type alone does not
 * declare it, so passing one was a type error. Needed by LoginForm to put
 * the cursor in the PIN box after a wrong PIN. */
type TextInputProps = ComponentPropsWithRef<"input"> & Omit<WrapperProps, "children">;

export function TextInput({ label, hint, error, required, className = "", ...rest }: TextInputProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      {/* required reaches the INPUT too (2026-08-31 visual audit): it used
          to stop at the wrapper, so every "required" field in the app drew
          a red asterisk while enforcing nothing — the browser never knew. */}
      <input required={required} className={`${fieldShell} ${fieldBorder(!!error)} ${className}`} {...rest} />
    </FieldWrapper>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & Omit<WrapperProps, "children">;

export function Select({ label, hint, error, required, className = "", children, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      {/* Custom chevron (2026-08-24, Oliver: "all chevron in dropdown seem
          off to the right side") -- the native arrow hugs the border with
          no breathing room and renders differently per browser.
          appearance-none + our own ChevronDownIcon at right-3, matching
          the 12px inner padding every other field edge uses. */}
      <div className="relative">
        <select required={required} className={`${fieldShell} ${fieldBorder(!!error)} appearance-none pr-9 ${className}`} {...rest}>
          {children}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-500)]" />
      </div>
    </FieldWrapper>
  );
}

/** Checkbox / Radio (added 2026-08-22, Positions retrofit).
 *
 * The whole <label> is the hit target, not just the 20px box — a 20px
 * control alone is well under the 44px minimum, and label-as-target is
 * what makes it pass without drawing an oversized box. `min-h-11` is on
 * the label for that reason; do NOT swap it for TAP_TARGET_PAD, which is
 * absorbed inside a fixed-size box under border-box sizing (the bug the
 * 2026-08-20 Tip Pool retrofit found).
 *
 * `description` renders under the label as always-visible text rather than
 * a `title=` tooltip — these explain consequences, and hover-only text is
 * unreachable on the phone half of the audience.
 */
interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

function Choice({ type, label, description, className = "", disabled, ...rest }: ChoiceProps & { type: "checkbox" | "radio" }) {
  return (
    <label
      className={`flex items-start gap-2.5 min-h-11 py-2 text-sm ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}
    >
      <input
        type={type}
        disabled={disabled}
        className="mt-0.5 size-5 shrink-0 accent-[var(--primary)] disabled:cursor-not-allowed"
        {...rest}
      />
      <span className="text-[var(--ink-900)]">
        {label}
        {description && <span className="block text-[var(--ink-500)] mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}
