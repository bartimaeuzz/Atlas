import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { SpinnerIcon } from "./icons";

type Variant = "primary" | "secondary" | "brand" | "destructive" | "destructive-outline" | "ghost";
type Size = "md" | "sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-600)] focus-visible:outline-[var(--primary-border)] disabled:bg-[var(--primary-border)] disabled:text-[var(--primary-tint)]",
  secondary: "bg-transparent text-[var(--ink-700)] border border-[var(--border-strong)] hover:bg-[var(--paper)] focus-visible:outline-[var(--primary-border)] disabled:opacity-50",
  brand: "bg-[var(--brand)] text-white hover:bg-[var(--brand-700)] focus-visible:outline-[var(--brand)] disabled:opacity-50",
  destructive: "bg-[var(--danger)] text-white hover:bg-[var(--danger-700)] focus-visible:outline-[var(--danger-border)] disabled:bg-[var(--danger-border)] disabled:text-[var(--danger-tint)]",
  "destructive-outline": "bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[var(--danger-tint)] focus-visible:outline-[var(--danger-border)] disabled:opacity-50",
  ghost: "bg-transparent text-[var(--ink-700)] hover:bg-[var(--paper)] focus-visible:outline-[var(--primary-border)] disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  md: "text-sm px-4 py-2.5 min-h-11", // 44px touch target
  sm: "text-xs px-3 py-2 min-h-9",
};

const shared =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-colors outline-offset-2 outline-2 outline-transparent focus-visible:outline disabled:cursor-not-allowed";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, disabled, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
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
