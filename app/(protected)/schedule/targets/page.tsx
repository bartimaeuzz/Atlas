import Link from "next/link";
import { loadStaffingTargets } from "@/lib/schedule/loadStaffingTargets";
import { TargetsForm } from "./TargetsForm";

export default async function StaffingTargetsPage() {
  const data = await loadStaffingTargets();

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Staffing targets</h1>
      <p className="text-neutral-500 text-sm mb-6">
        How many people you need in each position, by day of week and period. This is the
        baseline the weekly schedule grid uses to flag under-staffed days at a glance. Leave a
        cell blank or 0 if you don&apos;t normally staff that position that day/period. Each
        position gets a Lunch row and a Dinner row — use the &quot;All days&quot; +/- to bump
        every day in a row at once, or the per-day +/- to fine-tune a single cell.
      </p>

      {data.positions.length === 0 ? (
        <p className="text-neutral-500 text-sm">No active positions yet — add some in Positions first.</p>
      ) : (
        <TargetsForm positions={data.positions} targets={data.targets} />
      )}
    </main>
  );
}
