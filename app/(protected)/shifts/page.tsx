import Link from "next/link";
import { loadShiftsList } from "@/lib/shift/loadShiftsList";
import { dayOfWeek } from "@/lib/schedule/weekMath";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { toIso } from "@/lib/schedule/weekMath";
import { Badge } from "@/components/ui/Badge";
import { TableCard } from "@/components/ui/Table";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function ShiftsListPage({ searchParams }: { searchParams: Promise<{ month?: string; year?: string }> }) {
  // Phase C (2026-08-21): Settings is behind VIEW_SETTINGS, which
  // defaults to Admin+Partner -- so this shortcut would dead-end for
  // every Floor/Assistant Manager, on the page they use most. Hidden
  // rather than left to fail.
  const [allShifts, canSeeSettings] = await Promise.all([loadShiftsList(), hasCapability("VIEW_SETTINGS")]);

  // Two levels since 2026-08-24 (Oliver: "make shifts page show month
  // first as well" -- same shape as /ledger): no ?month= -> a month
  // picker for the year; ?month=YYYY-MM -> that month's Date | Lunch |
  // Dinner card table.
  const params = await searchParams;
  const todayIso = toIso(new Date());
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : null;

  if (!month) {
    const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : Number(todayIso.slice(0, 4));
    const currentMonth = todayIso.slice(0, 7);
    const months = MONTH_NAMES.map((name, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const inMonth = allShifts.filter((s) => s.date.startsWith(m));
      return {
        month: m,
        name,
        count: inMonth.length,
        finalized: inMonth.filter((s) => s.status === "finalized").length,
        isCurrent: m === currentMonth,
        // Clickable when there is something to see (or it is the working
        // month). An empty past month has no list to show; a future month
        // follows the ledger picker's not-yet rule.
        clickable: inMonth.length > 0 || m === currentMonth,
      };
    });

    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
        <PageHeader
          title="Shifts"
          actions={
            <>
              {canSeeSettings && (
                <LinkButton href="/settings" variant="secondary" size="sm">
                  Settings
                </LinkButton>
              )}
              <LinkButton href="/positions" variant="secondary" size="sm">
                Positions
              </LinkButton>
              <LinkButton href="/shifts/new" size="sm">
                + New shift
              </LinkButton>
            </>
          }
        />

        <div className="flex items-center justify-between mb-3">
          <Link href={`/shifts?year=${year - 1}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
            &larr; {year - 1}
          </Link>
          <span className="font-medium text-sm text-[var(--ink-900)]">{year}</span>
          <Link href={`/shifts?year=${year + 1}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
            {year + 1} &rarr;
          </Link>
        </div>

        {/* Phone: stacked cards */}
        <div className="lg:hidden space-y-2">
          {months.map((m) =>
            m.clickable ? (
              <Link
                key={m.month}
                href={`/shifts?month=${m.month}`}
                className={
                  "block bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 " +
                  (m.isCurrent ? "border-[var(--warning-border)] bg-[var(--warning-tint)]" : "border-[var(--border)]")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--ink-900)]">
                    {m.name}
                    {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This month</span>}
                  </span>
                  <span className="text-sm text-[var(--ink-500)]">
                    {m.count} shift{m.count === 1 ? "" : "s"}
                    {m.count > 0 && ` · ${m.finalized} finalized`}
                  </span>
                </div>
              </Link>
            ) : (
              <div key={m.month} className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--ink-500)]">{m.name}</span>
                  <span className="text-xs text-[var(--ink-500)]">No shifts</span>
                </div>
              </div>
            )
          )}
        </div>

        {/* Desktop: table */}
        <TableCard>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
                <th className="py-2 px-3 font-medium">Month</th>
                <th className="py-2 px-3 font-medium text-right">Shifts</th>
                <th className="py-2 px-3 font-medium text-right">Finalized</th>
                <th className="py-2 px-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className={"border-b border-[var(--border)] last:border-b-0" + (m.isCurrent ? " bg-[var(--warning-tint)]" : "")}>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {m.clickable ? (
                      <Link href={`/shifts?month=${m.month}`} className="hover:underline font-medium text-[var(--ink-900)]">
                        {m.name}
                        {m.isCurrent && <span className="ml-1.5 text-[10px] text-[var(--warning-700)] font-normal">This month</span>}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-500)] opacity-60">{m.name}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{m.count || "—"}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-[var(--ink-700)]">{m.count ? m.finalized : "—"}</td>
                  <td className="py-2 px-3 text-right">
                    {m.count === 0 ? (
                      <span className="text-[var(--ink-500)] opacity-60 text-xs">—</span>
                    ) : m.finalized === m.count ? (
                      <Badge tone="success">All finalized</Badge>
                    ) : (
                      <Badge tone="warning">{m.count - m.finalized} draft{m.count - m.finalized === 1 ? "" : "s"}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </main>
    );
  }

  const shifts = allShifts.filter((s) => s.date.startsWith(month));

  // Phone card table groups the flat list by date, keeping the loader's
  // date-desc order. A date never has two shifts of the same period --
  // shifts are unique per date+period by construction (see db/schema.ts's
  // note above the shifts table) -- so a plain per-period slot is safe.
  const shiftsByDate: { date: string; byPeriod: Partial<Record<"Lunch" | "Dinner", (typeof shifts)[number]>> }[] = [];
  for (const s of shifts) {
    let row = shiftsByDate.find((r) => r.date === s.date);
    if (!row) {
      row = { date: s.date, byPeriod: {} };
      shiftsByDate.push(row);
    }
    row.byPeriod[s.period as "Lunch" | "Dinner"] = s;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
      <PageHeader
        title="Shifts"
        actions={
          <>
            {canSeeSettings && (
              <LinkButton href="/settings" variant="secondary" size="sm">
                Settings
              </LinkButton>
            )}
            <LinkButton href="/positions" variant="secondary" size="sm">
              Positions
            </LinkButton>
            <LinkButton href="/shifts/new" size="sm">
              + New shift
            </LinkButton>
          </>
        }
      />

      <div className="mb-3">
        <Link href={`/shifts?year=${month.slice(0, 4)}`} className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          &larr; All months
        </Link>
        <span className="ml-3 font-medium text-sm text-[var(--ink-900)]">{MONTH_NAMES[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}</span>
      </div>

      {shifts.length === 0 ? (
        <EmptyState message="No shifts this month." action={<LinkButton href="/shifts/new" size="sm">+ New shift</LinkButton>} />
      ) : (
        <>
          {/* Date | Lunch | Dinner card table (2026-08-24, Oliver) -- same
           * shape the week view got, and since later the same day the ONLY
           * layout: the desktop one-row-per-shift table is gone ("add card
           * table to whole data"). One row per DATE, not per shift -- a
           * two-service day used to get two entries, so "did we close both
           * services on the 15th" meant finding both and matching the date
           * by eye. Each period's shift is a 44px tappable card going where
           * the old row linked (summary when finalized, roster otherwise). */}
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--card)]">
              <span>Date</span>
              <span>Lunch</span>
              <span>Dinner</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {shiftsByDate.map(({ date, byPeriod }) => (
                <div key={date} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 items-center">
                  {/* Weekday on a fixed-width span so every date starts at
                      the same x whether the day name is "Fri" or "Wed"
                      (Oliver, 2026-08-24: "with proper indent alignment"). */}
                  <span className="text-sm text-[var(--ink-900)]">
                    <span className="inline-block w-9 text-[var(--ink-500)]">{DAY_LABELS[dayOfWeek(date)]}</span>
                    {date}
                  </span>
                  {(["Lunch", "Dinner"] as const).map((period) => {
                    const shift = byPeriod[period];
                    if (!shift) {
                      return (
                        <span key={period} className="text-xs text-[var(--ink-400)]">
                          —
                        </span>
                      );
                    }
                    return (
                      // ONE layer of chrome (Oliver, 2026-08-24): the bordered
                      // 44px card IS the control, so the status inside is
                      // plain text in the badge's tone, not a second pill
                      // inside a border. Status is carried by the word itself,
                      // never colour alone. The blue arrow is gone with it.
                      <Link
                        key={period}
                        href={shift.status === "finalized" ? `/shifts/${shift.id}/summary` : `/shifts/${shift.id}/roster`}
                        className={
                          "flex min-h-11 items-center rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-medium " +
                          (shift.status === "finalized"
                            ? "border-[var(--success-border)] bg-[var(--success-tint)] text-[var(--success-700)]"
                            : "border-[var(--warning-border)] bg-[var(--warning-tint)] text-[var(--warning-700)]")
                        }
                      >
                        {shift.status === "finalized" ? "Finalized" : "Draft"}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

        </>
      )}
    </main>
  );
}
