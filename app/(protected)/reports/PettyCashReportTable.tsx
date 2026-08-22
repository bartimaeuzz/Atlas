import Link from "next/link";
import type { PettyCashReportData } from "@/lib/reports/loadPettyCashReport";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import { formatDayLabel } from "@/lib/format/formatDayLabel";
import {
  Card,
  Badge,
  TableCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TFoot,
  StackedCardList,
  StackedCard,
  StackedField,
  StackedTotal,
} from "@/components/ui";

/** Week/month view of Petty Cash (2026-08-14, Oliver's ask) -- one row
 * per day in the report's date range, click a date to open that day's
 * actual entry/reconciliation page at /ledger. Same range the Sales &
 * Tax report already uses (This week/month/year presets + custom), no
 * separate calendar UI needed. Floor Manager column added 2026-08-14
 * follow-up -- who finalized that day's reconciliation.
 *
 * Retrofitted onto the design system 2026-08-22, with two fixes:
 * money now goes through the shared formatMoney() (a negative used to
 * render "$-12.34" instead of Atlas's leading-minus convention), and
 * dates carry a weekday prefix so a month of rows is scannable by day.
 */
export function PettyCashReportTable({ data }: { data: PettyCashReportData }) {
  const totalEntries = data.days.reduce((s, d) => s + d.entryCount, 0);

  return (
    <section>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 max-w-xl">
        <SummaryStat label="Total spent" value={formatMoney(data.totalSpent)} />
        <SummaryStat label="Days finalized" value={String(data.finalizedCount)} />
        <SummaryStat
          label="Days with a mismatch"
          value={String(data.mismatchCount)}
          warn={data.mismatchCount > 0}
        />
      </div>

      {/* Phone: stacked cards.
          A day with no entries renders as ONE compact line, not a full card.
          Measured live 2026-08-22: a month range is mostly empty days (28 of
          32 in the August data), and at 122px per card that was 4,096px —
          4.9 screens, ~3.4 of them nothing but em dashes. A table row of
          dashes is cheap to skim; a four-row card of dashes is not. The day
          is still listed and still tappable, so an empty day stays
          distinguishable from a missing one — which matters on a cash
          reconciliation screen. */}
      <StackedCardList>
        {data.days.map((day) =>
          day.status === "no_data" ? (
            <Link
              key={day.date}
              href={`/ledger/day?date=${day.date}`}
              className="flex items-center justify-between gap-3 min-h-11 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm text-[var(--ink-500)]"
            >
              <span>{formatDayLabel(day.date)}</span>
              <span>No entries</span>
            </Link>
          ) : (
            <StackedCard
              key={day.date}
              title={
                <Link href={`/ledger/day?date=${day.date}`} className="underline underline-offset-2">
                  {formatDayLabel(day.date)}
                </Link>
              }
              trailing={<StatusBadge day={day} />}
            >
              <StackedField label="Entries" value={day.entryCount || "—"} numeric />
              <StackedField
                label="Spent"
                value={day.totalSpent > 0 ? formatMoney(day.totalSpent) : "—"}
                numeric
              />
              <StackedField label="Floor Manager" value={day.finalizedByName || "—"} />
            </StackedCard>
          )
        )}
        <StackedTotal label={`Total (${totalEntries} entries)`} value={formatMoney(data.totalSpent)} />
      </StackedCardList>

      {/* Desktop: table */}
      <TableCard>
        <Table minWidth={560}>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH numeric>Entries</TH>
              <TH numeric>Spent</TH>
              <TH>Status</TH>
              <TH>Floor Manager</TH>
            </TR>
          </THead>
          <TBody>
            {data.days.map((day) => (
              <TR key={day.date}>
                <TD emphasis className="whitespace-nowrap">
                  <Link href={`/ledger/day?date=${day.date}`} className="hover:underline underline-offset-2">
                    {formatDayLabel(day.date)}
                  </Link>
                </TD>
                <TD numeric>{day.entryCount || "—"}</TD>
                <TD numeric>{day.totalSpent > 0 ? formatMoney(day.totalSpent) : "—"}</TD>
                <TD>
                  <StatusBadge day={day} />
                </TD>
                <TD muted>{day.finalizedByName || "—"}</TD>
              </TR>
            ))}
          </TBody>
          <TFoot>
            <TD emphasis>Total</TD>
            <TD numeric emphasis>
              {totalEntries}
            </TD>
            <TD numeric emphasis>
              {formatMoney(data.totalSpent)}
            </TD>
            <TD />
            <TD />
          </TFoot>
        </Table>
      </TableCard>
    </section>
  );
}

function StatusBadge({ day }: { day: PettyCashReportData["days"][number] }) {
  if (day.status === "no_data") return <span className="text-[var(--ink-400)]">—</span>;
  if (day.status === "draft") return <Badge tone="neutral">Draft</Badge>;
  // finalized
  if (day.matches === false) return <Badge tone="danger">Mismatch</Badge>;
  return <Badge tone="success">Finalized</Badge>;
}

function SummaryStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card className={"!p-3 " + (warn ? "border-[var(--danger-border)] bg-[var(--danger-tint)]" : "")}>
      <div className="text-xs text-[var(--ink-500)]">{label}</div>
      <div
        className={
          "text-lg font-semibold tabular-nums " +
          (warn ? "text-[var(--danger-700)]" : "text-[var(--ink-900)]")
        }
      >
        {value}
      </div>
    </Card>
  );
}
