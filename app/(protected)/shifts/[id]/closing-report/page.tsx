import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClosingReportData } from "@/lib/shift/loadClosingReportData";
import { loadShiftAttendanceSummary } from "@/lib/shift/loadRosterPageData";
import { ClosingReportForm } from "./ClosingReportForm";
import { Banner } from "@/components/ui/Banner";
import { StatusBadge } from "@/components/ui/Badge";
import { AttendanceCoverageCard } from "../AttendanceCoverageCard";
import { ShiftStageNav } from "../ShiftStageNav";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

export default async function ClosingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const [data, attendance] = await Promise.all([loadClosingReportData(shiftId), loadShiftAttendanceSummary(shiftId)]);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold text-[var(--ink-900)] mb-1">
        Closing Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-[var(--ink-500)] mb-3 flex items-center gap-2">
        Status: <StatusBadge status={isFinalized ? "finalized" : "draft"} />
      </p>
      <ShiftStageNav shiftId={shiftId} current="closing" />

      {isFinalized && (
        <div className="mb-6">
          <Banner
            tone="warning"
            title="This shift is finalized — figures are locked."
            description={
              <Link href={`/shifts/${shiftId}/summary`} className={`underline ${TAP_TARGET_PAD}`}>
                View the Summary Report →
              </Link>
            }
          />
        </div>
      )}

      {/* Reminders for the deduction and extra-pay fields in the form
          below (rule 6: the manager types every number). */}
      <div className="mb-6 empty:mb-0">
        <AttendanceCoverageCard
          attendance={attendance}
          footer="Reminders only — use the Deductions and Extra pay fields below to decide any money. Edit marks on the Roster page."
        />
      </div>

      <ClosingReportForm shiftId={shiftId} data={data} isFinalized={isFinalized} />
    </main>
  );
}
