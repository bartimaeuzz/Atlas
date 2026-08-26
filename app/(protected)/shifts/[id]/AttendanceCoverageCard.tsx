import { Badge } from "@/components/ui/Badge";
import type { ShiftAttendanceSummary } from "@/lib/shift/loadRosterPageData";

const MARK_LABELS = { no_show: "No show", late: "Late", emergency: "Emergency" } as const;

/** The day's attendance & coverage record (2026-08-25, Oliver's
 * injury/no-show scenario) -- shared by the Closing Report (reminders
 * beside the deduction / extra-pay inputs) and the Preview page (part of
 * the pre-finalize review). Read-only on purpose: the app never turns a
 * mark into money; marks are edited on the Roster page. Renders nothing
 * when the day had no marks and no coverage. */
export function AttendanceCoverageCard({ attendance, footer }: { attendance: ShiftAttendanceSummary; footer?: string }) {
  if (attendance.marks.length === 0 && attendance.coverage.length === 0) return null;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--paper)]">
        Attendance &amp; coverage today
      </div>
      <div className="divide-y divide-[var(--border)] text-sm">
        {attendance.marks.map((m) => (
          <div key={`m-${m.employeeId}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-[var(--ink-900)]">{m.employeeName}</span>
            <Badge tone={m.mark === "no_show" ? "danger" : m.mark === "late" ? "warning" : "neutral"}>{MARK_LABELS[m.mark]}</Badge>
            {m.note && <span className="text-xs text-[var(--ink-500)]">“{m.note}”</span>}
          </div>
        ))}
        {attendance.coverage.map((c, i) => (
          <div key={`c-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-[var(--ink-900)]">{c.employeeName}</span>
            {c.kind === "extra" ? (
              <Badge tone="warning">extra</Badge>
            ) : (
              <span className="whitespace-nowrap text-[10px] leading-tight px-1 py-0.5 rounded-[var(--radius-sm)] bg-teal-100 text-teal-700 border border-teal-300">
                sub{c.coversEmployeeName ? ` for ${c.coversEmployeeName}` : ""}
              </span>
            )}
            {c.note && <span className="text-xs text-[var(--ink-500)]">“{c.note}”</span>}
          </div>
        ))}
      </div>
      {footer && <p className="px-3 py-2 text-xs text-[var(--ink-500)] border-t border-[var(--border)]">{footer}</p>}
    </div>
  );
}
