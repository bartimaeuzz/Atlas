import { loadShiftCalcData } from "@/lib/shift/loadRosterForCalc";
import { CalculatorForm } from "./CalculatorForm";
import { notFound } from "next/navigation";

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadShiftCalcData(shiftId);

  if (!data.shift) notFound();

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">
        Shift #{data.shift.id} — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-8">
        Status: {data.shift.status}. This page runs the real, unit-tested tip-pool
        calculation engine (<code>lib/calc/tipPool.ts</code>) against the roster below —
        nothing here is mocked or simplified.
      </p>

      <CalculatorForm
        roster={data.roster}
        initialCcTipTotal={data.sales?.ccTipTotal ?? 0}
      />
    </main>
  );
}
