import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRosterPageData } from "@/lib/shift/loadRosterPageData";
import { addRosterEntry, removeRosterEntry } from "@/lib/actions/shift";

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
              {data.roster.map((r) => (
                <tr key={r.rosterEntryId} className="border-b">
                  <td className="py-1.5">{r.employeeName}</td>
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
              ))}
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
          <form action={addRosterEntry} className="grid sm:grid-cols-3 gap-3 items-end">
            <input type="hidden" name="shiftId" value={shiftId} />
            <label className="text-sm">
              <span className="block text-neutral-500 mb-1">Employee</span>
              <select name="employeeId" required className="border rounded px-2 py-1 w-full">
                {data.allEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-neutral-500 mb-1">Position</span>
              <select name="positionId" required className="border rounded px-2 py-1 w-full">
                {data.allPositions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                ))}
              </select>
            </label>
            <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800">
              Add
            </button>
          </form>
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
