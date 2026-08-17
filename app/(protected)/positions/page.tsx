import Link from "next/link";
import { loadPositionsList } from "@/lib/positions/loadPositionsList";
import { ToggleActiveButton } from "./ToggleActiveButton";

const POOL_LABELS: Record<string, string> = {
  POOL_1_DINE_IN: "Pool 1",
  POOL_2_TAKEOUT_ONLINE: "Pool 2",
  POOL_3_DELIVERY: "Pool 3",
};

export default async function PositionsListPage() {
  const positionList = await loadPositionsList();

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Positions</h1>
        <Link href="/positions/new" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm">
          + New position
        </Link>
      </div>
      <p className="text-neutral-500 text-sm mb-3">
        Create and edit job positions — which tip pool(s) they belong to, roster visibility, and
        (for FOH) their flat wage rate. Retiring a position keeps every past shift that used it
        intact; it just stops showing up when staffing new ones.
      </p>
      <Link href="/settings/tip-pools" className="inline-block text-xs text-neutral-500 hover:text-black underline mb-6">
        Bulk-manage tip pool assignment for every position →
      </Link>

      {positionList.length === 0 ? (
        <p className="text-neutral-500 text-sm">No positions yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Category</th>
              <th className="py-2">Tip pools</th>
              <th className="py-2">Rate (L / D)</th>
              <th className="py-2"></th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {positionList.map((p) => (
              <tr key={p.id} className={"border-b" + (p.active ? "" : " opacity-50")}>
                <td className="py-2">
                  {p.name}
                  {!p.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
                </td>
                <td className="py-2">{p.category}</td>
                <td className="py-2">
                  {p.tipPoolGroups.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    p.tipPoolGroups.map((g) => POOL_LABELS[g]).join(", ")
                  )}
                </td>
                <td className="py-2">
                  {p.category === "FOH" ? (
                    <>
                      {p.shiftRates.find((r) => r.period === "Lunch")?.flatRate.toFixed(2) ?? "—"}
                      {" / "}
                      {p.shiftRates.find((r) => r.period === "Dinner")?.flatRate.toFixed(2) ?? "—"}
                    </>
                  ) : (
                    <span className="text-neutral-400">per-employee</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/positions/${p.id}/edit`} className="underline text-blue-600">
                    Edit
                  </Link>
                </td>
                <td className="py-2 text-right">
                  <ToggleActiveButton positionId={p.id} active={p.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
