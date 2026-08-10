import Link from "next/link";
import { loadShiftsList } from "@/lib/shift/loadShiftsList";

export default async function ShiftsListPage() {
  const shifts = await loadShiftsList();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Shifts</h1>
        <div className="flex gap-2">
          <Link href="/positions" className="border border-neutral-300 px-4 py-2 rounded hover:bg-neutral-50 text-sm">
            Positions
          </Link>
          <Link href="/shifts/new" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm">
            + New shift
          </Link>
        </div>
      </div>

      {shifts.length === 0 ? (
        <p className="text-neutral-500 text-sm">No shifts yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-2">Date</th>
              <th className="py-2">Period</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2">{s.date}</td>
                <td className="py-2">{s.period}</td>
                <td className="py-2">
                  <span
                    className={
                      "px-2 py-0.5 rounded text-xs " +
                      (s.status === "finalized" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")
                    }
                  >
                    {s.status}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {s.status === "finalized" ? (
                    <Link href={`/shifts/${s.id}/summary`} className="underline text-blue-600">
                      View summary →
                    </Link>
                  ) : (
                    <Link href={`/shifts/${s.id}/roster`} className="underline text-blue-600">
                      Continue →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
