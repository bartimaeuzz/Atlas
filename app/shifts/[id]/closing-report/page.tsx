import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClosingReportData } from "@/lib/shift/loadClosingReportData";
import { ClosingReportForm } from "./ClosingReportForm";

export default async function ClosingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadClosingReportData(shiftId);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href={`/shifts/${shiftId}/roster`} className="text-neutral-500 hover:underline">← Roster</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Closing Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-6">Status: {data.shift.status}</p>

      {isFinalized && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm mb-6">
          This shift is finalized — figures are locked.{" "}
          <Link href={`/shifts/${shiftId}/summary`} className="underline">View the Summary Report →</Link>
        </div>
      )}

      <ClosingReportForm shiftId={shiftId} data={data} isFinalized={isFinalized} />
    </main>
  );
}
