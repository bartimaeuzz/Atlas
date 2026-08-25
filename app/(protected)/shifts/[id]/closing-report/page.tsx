import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClosingReportData } from "@/lib/shift/loadClosingReportData";
import { loadShiftAttendanceSummary } from "@/lib/shift/loadRosterPageData";
import { ClosingReportForm } from "./ClosingReportForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { Banner } from "@/components/ui/Banner";
import { StatusBadge, Badge } from "@/components/ui/Badge";

const MARK_LABELS = { no_show: "No show", late: "Late", emergency: "Emergency" } as const;

export default async function ClosingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const [data, attendance] = await Promise.all([loadClosingReportData(shiftId), loadShiftAttendanceSummary(shiftId)]);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href={`/shifts/${shiftId}/roster`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:underline ${TAP_TARGET_PAD}`}>← Roster</Link>
      </p>
      <h1 className="text-2xl font-semibold text-[var(--ink-900)] mb-1">
        Closing Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-[var(--ink-500)] mb-6 flex items-center gap-2">
        Status: <StatusBadge status={isFinalized ? "finalized" : "draft"} />
      </p>

      {isFinalized && (
        <div className="mb-6">
          <Banner
            tone="warning"
            title="This shift is finalized — figures are locked."
            description={
              <Link href={`/shifts/${shiftId}/summary`} className="underline">
                View the Summary Report →
              </Link>
            }
          />
        </div>
      )}

      {/* Day's attendance & coverage record (2026-08-25, Oliver's
          injury/no-show scenario) -- reminders for the deduction and
          extra-pay fields in the form below. Read-only on purpose: the
          app never turns a mark into money; the manager types every
          number (rule 6). Marks are edited on the Roster page. */}
      {(attendance.marks.length > 0 || attendance.coverage.length > 0) && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] overflow-hidden">
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
                  <span className="text-[10px] leading-tight px-1 py-0.5 rounded-[var(--radius-sm)] bg-teal-100 text-teal-700 border border-teal-300">
                    sub{c.coversEmployeeName ? ` for ${c.coversEmployeeName}` : ""}
                  </span>
                )}
                {c.note && <span className="text-xs text-[var(--ink-500)]">“{c.note}”</span>}
              </div>
            ))}
          </div>
          <p className="px-3 py-2 text-xs text-[var(--ink-500)] border-t border-[var(--border)]">
            Reminders only — use the Deductions and Extra pay fields below to decide any money. Edit marks on the Roster page.
          </p>
        </div>
      )}

      <ClosingReportForm shiftId={shiftId} data={data} isFinalized={isFinalized} />
    </main>
  );
}
