import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import { AlertCircleIcon } from "./icons";

const fieldShell =
  "w-full box-sizing-border-box border rounded-[var(--radius-md)] px-3 py-2.5 text-base bg-[var(--card)] text-[var(--ink-900)] min-h-11 " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--primary-border)] focus:border-[var(--primary)] " +
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

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & Omit<WrapperProps, "children">;

export function TextInput({ label, hint, error, required, className = "", ...rest }: TextInputProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <input className={`${fieldShell} ${fieldBorder(!!error)} ${className}`} {...rest} />
    </FieldWrapper>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & Omit<WrapperProps, "children">;

export function Select({ label, hint, error, required, className = "", children, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <select className={`${fieldShell} ${fieldBorder(!!error)} ${className}`} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  );
}
