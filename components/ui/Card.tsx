import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-1)] p-5 ${className}`}
      {...rest}
    />
  );
}

export function Section({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-6 ${className}`}>
      {title && <h2 className="text-xl font-semibold text-[var(--ink-900)] mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--ink-900)]">{title}</h1>
        {description && <p className="text-sm text-[var(--ink-500)] mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-[var(--border-strong)] rounded-[var(--radius-lg)]">
      <p className="text-sm text-[var(--ink-500)]">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
