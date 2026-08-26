export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--paper)] text-[var(--ink-700)] border-[var(--border)]",
  success: "bg-[var(--success-tint)] text-[var(--success-700)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-tint)] text-[var(--warning-700)] border-[var(--warning-border)]",
  danger: "bg-[var(--danger-tint)] text-[var(--danger-700)] border-[var(--danger-border)]",
  primary: "bg-[var(--primary-tint)] text-[var(--primary-700)] border-[var(--primary-border)]",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium border rounded-[var(--radius-full)] px-2.5 py-1 ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

/** Shift-status specific mapping so callers don't repeat the draft/finalized -> tone logic per screen. */
export function StatusBadge({ status }: { status: "draft" | "finalized" }) {
  return status === "finalized" ? <Badge tone="success">Finalized</Badge> : <Badge tone="warning">Draft</Badge>;
}
