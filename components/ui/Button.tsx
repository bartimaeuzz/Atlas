import type { ButtonHTMLAttributes, Ref } from "react";
import Link from "next/link";
import { SpinnerIcon } from "./icons";

type Variant = "primary" | "secondary" | "brand" | "destructive" | "destructive-outline" | "ghost";
type Size = "md" | "sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-600)] active:brightness-90 disabled:bg-[var(--primary-border)] disabled:text-[var(--primary-tint)]",
  secondary: "bg-transparent text-[var(--ink-700)] border border-[var(--border-strong)] hover:bg-[var(--paper)] active:bg-[var(--border)] disabled:opacity-50",
  brand: "bg-[var(--brand)] text-white hover:bg-[var(--brand-700)] active:brightness-90 disabled:opacity-50",
  destructive: "bg-[var(--danger)] text-white hover:bg-[var(--danger-700)] active:brightness-90 disabled:bg-[var(--danger-border)] disabled:text-[var(--danger-tint)]",
  "destructive-outline": "bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger-tint)] active:bg-[var(--danger-border)] disabled:opacity-50",
  ghost: "bg-transparent text-[var(--ink-700)] hover:bg-[var(--paper)] active:bg-[var(--border)] disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  md: "text-sm px-4 py-2.5 min-h-11", // 44px touch target
  sm: "text-xs px-3 py-2 min-h-9",
};

/** Focus ring, rebuilt 2026-08-22 after the visual audit measured it at
 * 1px and ~1.4:1 contrast — a WCAG 1.4.11 (Non-text Contrast, 3:1) failure
 * on every button in the app. Two independent bugs, both invisible to
 * tsc/eslint/build:
 *
 *   WIDTH. The old classes were `outline-2 … focus-visible:outline`. Both
 *   utilities set outline-width — `.outline` to 1px, `.outline-2` to 2px —
 *   and `.focus-visible\:outline:focus-visible` is a class PLUS a
 *   pseudo-class, so it outranks the plain `.outline-2` on specificity and
 *   reset the ring to 1px. Source order never came into it. Fixed by
 *   putting the width on the focus-visible variant itself.
 *
 *   COLOUR. `--primary-border` (#BFDBFE) is a border tint, not an
 *   indicator colour: ~1.4:1 against white. The ring sits at
 *   `outline-offset: 2px`, i.e. on the page background rather than on the
 *   button, so one strong colour serves every variant — `--primary` gives
 *   6.7:1 in light and 4.5:1 in dark, both clear of the 3:1 floor, and
 *   keeps the blue focus affordance rather than going neutral.
 *
 * Consequence for variants: none of them set their own focus colour any
 * more. Resist re-adding a per-variant ring — a focus indicator's job is
 * to be found, not to match the control it surrounds. */
/** Press state (2026-08-25, Oliver: "dont we have any press state or tap
 * state?") -- every variant darkens/tints one step past hover on :active
 * plus a 2% shrink, so a tap gives feedback where hover doesn't exist.
 * Hand-rolled controls get the restored tap-highlight in globals.css. */
const shared =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-colors outline-offset-2 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** React 19 passes `ref` as an ordinary prop to function components, so no
   *  forwardRef wrapper is needed — it just has to be declared. Added so a
   *  dialog can point initial focus at a specific button (ConfirmDialog
   *  lands focus on Cancel). */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "primary", size = "md", loading, disabled, className = "", children, ref, ...rest }: ButtonProps) {
  return (
    <button
      ref={ref}
      className={`${shared} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <SpinnerIcon /> : children}
    </button>
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", size = "md", className = "", children }: LinkButtonProps) {
  return (
    <Link href={href} className={`${shared} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </Link>
  );
}

/** Button-styled plain <a>, for hrefs that must NOT go through the Next
 * router: file downloads served by a route handler, and external links.
 *
 * Why this exists (2026-08-22 visual audit): the Reports export was moved
 * onto LinkButton during the retrofit, and next/link PREFETCHES. The
 * prefetch requests the download route with `?_rsc=…` and none of the
 * from/to params the handler requires, so every single /reports page view
 * fired a 400 against /reports/export and logged a console error. A
 * download is a plain browser navigation, not a client-side route
 * transition — it should never have been a <Link>. */
export function DownloadLinkButton({ href, variant = "primary", size = "md", className = "", children }: LinkButtonProps) {
  return (
    <a href={href} className={`${shared} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </a>
  );
}
