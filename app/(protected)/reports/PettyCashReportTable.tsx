import Link from "next/link";
import type { PettyCashReportData } from "@/lib/reports/loadPettyCashReport";

const STATUS_LABEL: Record<string, string> = {
  no_data: "—",
  draft: "Draft",
  finalized: "Finalized",
};

/** Week/month view of Petty Cash (2026-08-14, Oliver's ask) -- one row
 * per day in the report's date range, click a date to open that day's
 * actual entry/reconciliation page at /ledger. Same range the Sales &
 * Tax report already uses (This week/month/year presets + custom), no
 * separate calendar UI needed. Floor Manager column added 2026-08-14
 * follow-up -- who finalized that day's reconciliation. */
export function PettyCashReportTable({ data }: { data: PettyCashReportData }) {
  return (
    <section>
      <div className="grid grid-cols-3 gap-4 mb-4 max-w-xl">
        <SummaryStat label="Total spent" value={`$${data.totalSpent.toFixed(2)}`} />
        <SummaryStat label="Days finalized" value={String(data.finalizedCount)} />
        <SummaryStat
          label="Days with a mismatch"
          value={String(data.mismatchCount)}
          warn={data.mismatchCount > 0}
        />
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-neutral-500 border-b">
            <th className="py-1.5">Date</th>
            <th className="py-1.5 text-right">Entries</th>
            <th className="py-1.5 text-right">Spent</th>
            <th className="py-1.5 text-right">Status</th>
            <th className="py-1.5">Floor Manager</th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((day) => (
            <tr key={day.date} className="border-b">
              <td className="py-1.5">
                <Link href={`/ledger/day?date=${day.date}`} className="hover:underline">
                  {day.date}
                </Link>
              </td>
              <td className="py-1.5 text-right tabular-nums">{day.entryCount || "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{day.totalSpent > 0 ? `$${day.totalSpent.toFixed(2)}` : "—"}</td>
              <td className="py-1.5 text-right">
                <StatusBadge day={day} />
              </td>
              <td className="py-1.5 text-neutral-600">{day.finalizedByName || "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-medium">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{data.days.reduce((s, d) => s + d.entryCount, 0)}</td>
            <td className="py-2 text-right tabular-nums">${data.totalSpent.toFixed(2)}</td>
            <td className="py-2"></td>
            <td className="py-2"></td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function StatusBadge({ day }: { day: PettyCashReportData["days"][number] }) {
  if (day.status === "no_data") return <span className="text-neutral-300">—</span>;
  if (day.status === "draft") return <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">Draft</span>;
  // finalized
  if (day.matches === false) {
    return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Mismatch</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">Finalized</span>;
}

function SummaryStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={"border rounded p-3 " + (warn ? "border-red-200 bg-red-50" : "bg-neutral-50")}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={"text-lg font-semibold " + (warn ? "text-red-700" : "")}>{value}</div>
    </div>
  );
}
