import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { metricDefinitions, positionMetrics } from "@/db/schema";
import { loadShiftCalcData } from "@/lib/shift/loadRosterForCalc";
import { CalculatorForm } from "./CalculatorForm";
import { notFound } from "next/navigation";

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadShiftCalcData(shiftId);

  if (!data.shift) notFound();

  // Which positions are eligible for the host drink bonus — driven by the
  // positionMetrics table now, not a positionName.startsWith("Host") string
  // match (that hack predates this table; the real closing report uses the
  // same source of truth via loadClosingReportData).
  const [hostMetric] = await db
    .select()
    .from(metricDefinitions)
    .where(eq(metricDefinitions.key, "host_qualifying_drink_count"));
  const hostBonusEligiblePositionIds = hostMetric
    ? (await db.select().from(positionMetrics).where(eq(positionMetrics.metricDefinitionId, hostMetric.id))).map(
        (r) => r.positionId
      )
    : [];

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
        hostBonusEligiblePositionIds={hostBonusEligiblePositionIds}
      />
    </main>
  );
}
