import Link from "next/link";
import type { PettyCashReportData } from "@/lib/reports/loadPettyCashReport";
import { Badge } from "@/components/ui/Badge";
import { TableCard } from "@/components/ui/Table";
import { MonthRow } from "./MonthRow";
import { formatMoney } from "./formatMoney";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthSummary {
  month: string; // YYYY-MM
  name: string;
  entryCount: number;
  totalSpent: number;
  daysWithData: number;
  daysFinalized: number;
  mismatches: number;
  isFuture: boolean;
  isCurrent: boolean;
}

/** Month picker table — /ledger's landing since 2026-08-24 (Oliver:
 * "ledger show month list in table first"). One row per month of the
 * chosen year, aggregated from the same PettyCashReportData the day
 * list uses; clicking a month goes to that month's day list
 * (/ledger?month=YYYY-MM). Future months follow the same rule future
 * days always had: visible, not clickable — "not be editable before
 * day comes." */
export function YearMonthList({ data, year, todayIso }: { data: PettyCashReportData; year: number; todayIso: string }) {
  const currentMonth = todayIso.slice(0, 7);

  const months: MonthSummary[] = MONTH_NAMES.map((name, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const days = data.days.filter((d) => d.date.startsWith(month));
    const withData = days.filter((d) => d.status !== "no_data");
    return {
      month,
      name,
      entryCount: days.reduce((s, d) => s + d.entryCount, 0),
      totalSpent: days.reduce((s, d) => s + d.totalSpent, 0),
      daysWithData: withData.length,
      daysFinalized: withData.filter((d) => d.status === "finalized").length,
      mismatches: days.filter((d) => d.matches === false).length,
      isFuture: month > currentMonth,
      isCurrent: month === currentMonth,
    };
  });

  return (
    <>
      {/* Phone: stacked cards */}
      <div className="lg:hidden space-y-2">
        {months.map((m) => {
          const content = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className={"font-semibold " + (m.isFuture ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]")}>
                  {m.name}
                  {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This month</span>}
                </span>
                {m.isFuture ? <span className="text-xs text-[var(--ink-500)]">Not yet</span> : <MonthStatusBadge m={m} />}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-500)]">
                  {m.isFuture ? "—" : `${m.entryCount || 0} entr${m.entryCount === 1 ? "y" : "ies"}`}
                </span>
                <span className="tabular-nums text-[var(--ink-900)] font-medium">
                  {m.isFuture ? "—" : m.totalSpent > 0 ? formatMoney(m.totalSpent) : "—"}
                </span>
              </div>
            </>
          );
          return m.isFuture ? (
            <div key={m.month} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 opacity-60">
              {content}
            </div>
          ) : (
            <Link
              key={m.month}
              href={`/ledger?month=${m.month}`}
              className={
                "block bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 " +
                (m.isCurrent ? "border-[var(--warning-border)] bg-[var(--warning-tint)]" : "border-[var(--border)]")
              }
            >
              {content}
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <TableCard>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
              <th className="py-2 px-3 font-medium">Month</th>
              <th className="py-2 px-3 font-medium text-right">Entries</th>
              <th className="py-2 px-3 font-medium text-right">Spent</th>
              <th className="py-2 px-3 font-medium text-right">Days finalized</th>
              <th className="py-2 px-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const cells = (
                <>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {m.isFuture ? (
                      <span className="text-[var(--ink-500)] opacity-60">{m.name}</span>
                    ) : (
                      <Link href={`/ledger?month=${m.month}`} className="hover:underline font-medium text-[var(--ink-900)]">
                        {m.name}
                        {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This month</span>}
                      </Link>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{m.isFuture ? "—" : m.entryCount || "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-900)]">
                    {m.isFuture ? "—" : m.totalSpent > 0 ? formatMoney(m.totalSpent) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">
                    {m.isFuture || m.daysWithData === 0 ? "—" : `${m.daysFinalized}/${m.daysWithData}`}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {m.isFuture ? <span className="text-[var(--ink-500)] opacity-60 text-xs">Not yet</span> : <MonthStatusBadge m={m} />}
                  </td>
                </>
              );
              // Whole row clickable (Oliver, 2026-08-24), reusing the day
              // list's MonthRow: mouse gets the row, keyboard keeps exactly
              // one tab stop on the real link in the Month cell. Future
              // months stay plain rows -- not clickable by rule.
              return m.isFuture ? (
                <tr key={m.month} className="border-b border-[var(--border)] last:border-b-0">
                  {cells}
                </tr>
              ) : (
                <MonthRow key={m.month} href={`/ledger?month=${m.month}`} isToday={m.isCurrent}>
                  {cells}
                </MonthRow>
              );
            })}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

/** Never colour alone: every state carries its word. */
function MonthStatusBadge({ m }: { m: MonthSummary }) {
  if (m.daysWithData === 0) return <span className="text-[var(--ink-500)] opacity-60">—</span>;
  if (m.mismatches > 0) return <Badge tone="danger">{m.mismatches} mismatch{m.mismatches === 1 ? "" : "es"}</Badge>;
  if (m.daysFinalized < m.daysWithData) return <Badge tone="neutral">In progress</Badge>;
  return <Badge tone="success">All finalized</Badge>;
}
