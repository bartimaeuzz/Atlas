import Link from "next/link";
import type { PettyCashReportData } from "@/lib/reports/loadPettyCashReport";

/** One row per day in the selected month, for the new /ledger landing
 * (2026-08-14 restructure). Reuses the same PettyCashReportData shape
 * loadPettyCashReport already produces for the /reports Petty Cash tab --
 * same data, different lens (a working picker here, vs. an accounting
 * range report there).
 *
 * Future dates (haven't happened yet) are shown but NOT clickable --
 * Oliver's rule: "not be editable before day comes." The day page itself
 * (/ledger/day) also refuses a future date server-side if someone lands
 * there directly, so this is a UX nicety, not the only guard. */
export function MonthList({ data, todayIso }: { data: PettyCashReportData; todayIso: string }) {
  return (
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
        {data.days.map((day) => {
          const isFuture = day.date > todayIso;
          const isToday = day.date === todayIso;
          return (
            <tr key={day.date} className={"border-b" + (isToday ? " bg-amber-50" : "")}>
              <td className="py-1.5">
                {isFuture ? (
                  <span className="text-neutral-300">{day.date}</span>
                ) : (
                  <Link href={`/ledger/day?date=${day.date}`} className="hover:underline font-medium">
                    {day.date}
                    {isToday && <span className="ml-1.5 text-[10px] text-amber-700 font-normal">Today</span>}
                  </Link>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">{isFuture ? "—" : day.entryCount || "—"}</td>
              <td className="py-1.5 text-right tabular-nums">
                {isFuture ? "—" : day.totalSpent > 0 ? `$${day.totalSpent.toFixed(2)}` : "—"}
              </td>
              <td className="py-1.5 text-right">{isFuture ? <span className="text-neutral-300 text-xs">Not yet</span> : <StatusBadge day={day} />}</td>
              <td className="py-1.5 text-neutral-600">{isFuture ? "—" : day.finalizedByName || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StatusBadge({ day }: { day: PettyCashReportData["days"][number] }) {
  if (day.status === "no_data") return <span className="text-neutral-300">—</span>;
  if (day.status === "draft") return <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">Draft</span>;
  if (day.matches === false) {
    return <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Mismatch</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">Finalized</span>;
}
