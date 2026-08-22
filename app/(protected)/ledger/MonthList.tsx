import Link from "next/link";
import type { PettyCashReportData } from "@/lib/reports/loadPettyCashReport";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "./formatMoney";

/** One row per day in the selected month, for the new /ledger landing
 * (2026-08-14 restructure). Reuses the same PettyCashReportData shape
 * loadPettyCashReport already produces for the /reports Petty Cash tab --
 * same data, different lens (a working picker here, vs. an accounting
 * range report there).
 *
 * Future dates (haven't happened yet) are shown but NOT clickable --
 * Oliver's rule: "not be editable before day comes." The day page itself
 * (/ledger/day) also refuses a future date server-side if someone lands
 * there directly, so this is a UX nicety, not the only guard.
 *
 * Restyled onto the design system 2026-08-19 -- this is the only genuine
 * HTML `<table>` left in the Ledger tree (every other list in this folder
 * was already built as a phone-first `<ul>`, per this app's own established
 * convention), so it gets the standard stacked-cards-on-phone /
 * table-on-desktop split rather than a horizontally-scrolling 5-column
 * table at 375px. */
export function MonthList({ data, todayIso }: { data: PettyCashReportData; todayIso: string }) {
  return (
    <>
      {/* Phone: stacked cards */}
      <div className="lg:hidden space-y-2">
        {data.days.map((day) => {
          const isFuture = day.date > todayIso;
          const isToday = day.date === todayIso;
          const content = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className={"font-semibold " + (isFuture ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>
                  {day.date}
                  {isToday && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">Today</span>}
                </span>
                {isFuture ? (
                  <span className="text-xs text-[var(--ink-500)]">Not yet</span>
                ) : (
                  <DayStatusBadge day={day} />
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-500)]">
                  {isFuture ? "—" : `${day.entryCount || 0} entr${day.entryCount === 1 ? "y" : "ies"}`}
                </span>
                <span className="tabular-nums text-[var(--ink-900)] font-medium">
                  {isFuture ? "—" : day.totalSpent > 0 ? formatMoney(day.totalSpent) : "—"}
                </span>
              </div>
              {!isFuture && day.finalizedByName && (
                <div className="text-xs text-[var(--ink-500)] mt-0.5">Floor Manager: {day.finalizedByName}</div>
              )}
            </>
          );
          return isFuture ? (
            <div key={day.date} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 opacity-60">
              {content}
            </div>
          ) : (
            <Link
              key={day.date}
              href={`/ledger/day?date=${day.date}`}
              className={
                "block bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 " +
                (isToday ? "border-[var(--warning-border)] bg-[var(--warning-tint)]" : "border-[var(--border)]")
              }
            >
              {content}
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <table className="hidden lg:table w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 font-medium text-right">Entries</th>
            <th className="py-2 font-medium text-right">Spent</th>
            <th className="py-2 font-medium text-right">Status</th>
            <th className="py-2 font-medium">Floor Manager</th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((day) => {
            const isFuture = day.date > todayIso;
            const isToday = day.date === todayIso;
            return (
              <tr key={day.date} className={"border-b border-[var(--border)]" + (isToday ? " bg-[var(--warning-tint)]" : "")}>
                <td className="py-2">
                  {isFuture ? (
                    <span className="text-[var(--ink-500)] opacity-60">{day.date}</span>
                  ) : (
                    <Link href={`/ledger/day?date=${day.date}`} className="hover:underline font-medium text-[var(--ink-900)]">
                      {day.date}
                      {isToday && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">Today</span>}
                    </Link>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-[var(--ink-700)]">{isFuture ? "—" : day.entryCount || "—"}</td>
                <td className="py-2 text-right tabular-nums text-[var(--ink-900)]">
                  {isFuture ? "—" : day.totalSpent > 0 ? formatMoney(day.totalSpent) : "—"}
                </td>
                <td className="py-2 text-right">
                  {isFuture ? <span className="text-[var(--ink-500)] opacity-60 text-xs">Not yet</span> : <DayStatusBadge day={day} />}
                </td>
                <td className="py-2 text-[var(--ink-700)]">{isFuture ? "—" : day.finalizedByName || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function DayStatusBadge({ day }: { day: PettyCashReportData["days"][number] }) {
  if (day.status === "no_data") return <span className="text-[var(--ink-500)] opacity-60">—</span>;
  if (day.status === "draft") return <Badge tone="neutral">Draft</Badge>;
  if (day.matches === false) return <Badge tone="danger">Mismatch</Badge>;
  return <Badge tone="success">Finalized</Badge>;
}
