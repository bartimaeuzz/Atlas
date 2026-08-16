import { AlertTriangleIcon } from "./icons";

/** Visually separated "different zone" container for irreversible actions
 * at the bottom of a settings/detail page -- a low-computer-literacy user
 * should never stumble into this by scrolling. */
export function DangerZoneSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[var(--danger-border)] bg-[var(--danger-tint)] rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangleIcon className="text-[var(--danger)]" width={18} height={18} />
        <span className="text-[15px] font-bold text-[var(--danger-700)]">Danger zone</span>
      </div>
      <p className="text-sm text-[var(--danger-700)] mb-3.5">These actions can&apos;t be undone. Double-check before continuing.</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function DangerZoneRow({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-[var(--card)] border border-[var(--danger-border)] rounded-[var(--radius-md)] px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-[var(--ink-900)]">{title}</div>
        <div className="text-xs text-[var(--ink-500)]">{description}</div>
      </div>
      {action}
    </div>
  );
}
