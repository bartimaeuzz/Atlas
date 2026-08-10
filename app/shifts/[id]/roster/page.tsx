import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRosterPageData } from "@/lib/shift/loadRosterPageData";
import { removeRosterEntry } from "@/lib/actions/shift";
import { AddRosterEntryForm } from "./AddRosterEntryForm";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadRosterPageData(shiftId);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/shifts" className="text-neutral-500 hover:underline">← All shifts</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Roster — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-6">Status: {data.shift.status}</p>

      {isFinalized && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm mb-6">
          This shift is finalized — the roster is locked.{" "}
          <Link href={`/shifts/${shiftId}/summary`} className="underline">View the Summary Report →</Link>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">On the roster ({data.roster.length})</h2>
        {data.roster.length === 0 ? (
          <p className="text-sm text-neutral-500">Nobody added yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1.5">Employee</th>
                <th className="py-1.5">Position</th>
                <th className="py-1.5">Point override</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map((r) => {
                const roleCount = data.roster.filter((x) => x.employeeId === r.employeeId).length;
                return (
                  <tr key={r.rosterEntryId} className="border-b">
                    <td className="py-1.5">
                      {r.employeeName}
                      {roleCount > 1 && (
                        <span
                          className="ml-2 inline-block bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded"
                          title="This person has multiple roles on this shift — paid on one combined paycheck."
                        >
                          {roleCount} roles
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-neutral-500">
                      {r.positionName} <span className="text-xs">({r.positionCategory})</span>
                    </td>
                    <td className="py-1.5">{r.pointValueOverride ?? "—"}</td>
                    <td className="py-1.5 text-right">
                      {!isFinalized && (
                        <form action={removeRosterEntry}>
                          <input type="hidden" name="rosterEntryId" value={r.rosterEntryId} />
                          <input type="hidden" name="shiftId" value={shiftId} />
                          <button type="submit" className="text-red-600 hover:underline text-xs">
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {!isFinalized && (
        <section className="mb-8 border rounded p-4">
          <h2 className="text-lg font-medium mb-3">Add someone</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Point value adjustments happen later, on the Closing Report page right before Save —
            not here. This page is just who&apos;s working today.
          </p>
          <AddRosterEntryForm
            shiftId={shiftId}
            roster={data.roster}
            allEmployees={data.allEmployees}
            allPositions={data.allPositions}
            employeeAssignedPositionIds={data.employeeAssignedPositionIds}
          />
        </section>
      )}

      <Link
        href={`/shifts/${shiftId}/closing-report`}
        className="inline-block bg-neutral-900 text-white px-4 py-2 rounded hover:bg-neutral-800"
      >
        Next: Closing Report →
      </Link>
    </main>
  );
}
