"use client";

import { useState } from "react";
import type { MyShiftEarnings } from "@/lib/staff/loadMyEarnings";
import { formatSlice } from "@/lib/staff/poolTotals";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ViewMode = "week" | "month";

/** Groups + a Week/Month toggle for the My Pay history (2026-08-10,
 * added after Oliver asked for it explicitly: "should show by week with
 * payout detail on each day or by month... filter so employee can keep
 * track their income easily"). No date library — the grouping math here
 * is simple enough (week-start = most recent Monday, month = YYYY-MM)
 * that pulling in a dependency wasn't worth it. Dates are parsed pinned
 * to UTC noon (see parseDate below) specifically to avoid a date string
 * like "2026-08-03" silently rendering as Aug 2 in a negative-UTC-offset
 * timezone — a classic date-string timezone bug, avoided here on purpose. */
export function MyEarningsView({
  shifts,
  viewerEmployeeId,
}: {
  shifts: MyShiftEarnings[];
  viewerEmployeeId: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  const groups = viewMode === "week" ? groupByWeek(shifts) : groupByMonth(shifts);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-[var(--ink-500)] mr-1">View by</span>
        <ToggleButton active={viewMode === "week"} onClick={() => setViewMode("week")}>
          Week
        </ToggleButton>
        <ToggleButton active={viewMode === "month"} onClick={() => setViewMode("month")}>
          Month
        </ToggleButton>
      </div>

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="flex items-baseline justify-between border-b border-[var(--border)] pb-2 mb-4">
              <h2 className="font-semibold">{group.label}</h2>
              <span className="font-semibold tabular-nums">${group.subtotal.toFixed(2)}</span>
            </div>
            <div className="space-y-4">
              {group.days.map((day) => (
                <div key={day.date}>
                  <div className="flex items-baseline justify-between text-sm text-[var(--ink-500)] mb-2">
                    <span>{day.label}</span>
                    <span className="tabular-nums">${day.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="space-y-3">
                    {day.shifts.map((s) => (
                      <ShiftCard key={s.shiftId} shift={s} viewerEmployeeId={viewerEmployeeId} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Design-system retrofit 2026-08-24: the old hand-rolled toggle's
 * inactive state had no min-height (a sub-44px touch target) and its own
 * ad hoc border/radius. Button primary/secondary carries the standard
 * sizing, focus ring, and touch target; aria-pressed makes the toggle
 * state real for assistive tech instead of colour-only. */
function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={active ? "primary" : "secondary"} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

function ShiftCard({ shift, viewerEmployeeId }: { shift: MyShiftEarnings; viewerEmployeeId: number }) {
  const p = shift.payout;
  return (
    <Card className="!p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-medium">{shift.period}</h3>
        <span className="text-lg font-semibold tabular-nums">${p.totalCorePayout.toFixed(2)}</span>
      </div>

      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
        {p.pointValueUsed !== null && (
          <Row label="Your point value" value={p.pointValueUsed.toFixed(2)} />
        )}
        {/* 2026-09-01: the inputs behind the number (backlog round 4 item
            3). Each pool the person was in shows its total and their slice,
            then their dollar share — read-only, from the locked payout
            rows, no money rule changes. Totals are null when the viewer
            may not see peers' tips (see loadMyEarnings). */}
        {p.pool1Share > 0 && (
          <PoolRows label="Pool 1 (dine-in)" share={p.pool1Share} total={shift.poolTotals.pool1Total} />
        )}
        {p.pool2Share > 0 && (
          <PoolRows label="Pool 2 (takeout/online)" share={p.pool2Share} total={shift.poolTotals.pool2Total} />
        )}
        {p.pool3Share > 0 && (
          <PoolRows label="Pool 3 (delivery)" share={p.pool3Share} total={shift.poolTotals.pool3Total} />
        )}
        {p.hostUpsellTipShare > 0 && <Row label="Drink bonus" value={`$${p.hostUpsellTipShare.toFixed(2)}`} />}
        <Row label="Total tip" value={`$${p.totalTip.toFixed(2)}`} />
        <Row label="Wage" value={`$${p.flatWageAmount.toFixed(2)}`} />
        {p.extraPayAmount > 0 && <Row label="Extra pay" value={`$${p.extraPayAmount.toFixed(2)}`} />}
        {p.incentiveAmount > 0 && <Row label="Incentive" value={`$${p.incentiveAmount.toFixed(2)}`} />}
        {p.deductionAmount > 0 && (
          <Row label="Deduction" value={`-$${p.deductionAmount.toFixed(2)}`} valueClassName="text-[var(--danger-700)]" />
        )}
      </dl>
      {p.pointValueUsed !== null && (
        <p className="text-xs text-[var(--ink-400)] -mt-2 mb-3">
          Your point value sets your share of the point-weighted tip pool that shift — a higher
          number means a bigger slice of Pool 1/2 relative to your coworkers.
        </p>
      )}

      {shift.coworkers.length > 1 && (
        <div className="border-t border-[var(--border)] pt-3">
          <div className="text-xs text-[var(--ink-500)] mb-2">Also worked this shift</div>
          <ul className="text-sm space-y-1">
            {shift.coworkers
              .filter((c) => c.employeeId !== viewerEmployeeId)
              .map((c) => (
                <li key={c.employeeId} className="flex justify-between">
                  <span>
                    {c.employeeName} <span className="text-[var(--ink-400)]">— {c.positionName}</span>
                  </span>
                  {/* Tip and wage are shown/hidden independently now
                      (2026-08-10 split) — a coworker's row may show just
                      one, both, or neither, depending on the restaurant's
                      Tip/Wage visibility settings for that category. */}
                  {(typeof c.tipShare === "number" || typeof c.flatWage === "number") && (
                    <span className="tabular-nums text-[var(--ink-500)]">
                      {typeof c.tipShare === "number" && `$${(c.tipShare as number).toFixed(2)} tip`}
                      {typeof c.tipShare === "number" && typeof c.flatWage === "number" && " + "}
                      {typeof c.flatWage === "number" && `$${(c.flatWage as number).toFixed(2)} wage`}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** One pool's block: the pool's total, the person's share of it as a
 * percent, and their dollars. Collapses to the dollar line alone when the
 * total is not available to this viewer; a solo member sees the total and
 * "only you" instead of a redundant 100%. */
function PoolRows({ label, share, total }: { label: string; share: number; total: number | null }) {
  const poolName = label.replace(/\s*\(.*\)$/, ""); // "Pool 1 (dine-in)" -> "Pool 1"
  const solo = total !== null && Math.abs(total - share) < 0.005;
  const slice = total !== null && !solo ? formatSlice(share, total) : null;
  return (
    <>
      {total !== null && <Row label={`${label} total`} value={`$${total.toFixed(2)}`} />}
      {solo && <Row label={`Your share of ${poolName}`} value="only you" />}
      {slice !== null && <Row label={`Your share of ${poolName}`} value={slice} />}
      <Row label={`${label} tip`} value={`$${share.toFixed(2)}`} />
    </>
  );
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="contents">
      <dt className="text-[var(--ink-500)]">{label}</dt>
      <dd className={`text-right tabular-nums ${valueClassName ?? ""}`}>{value}</dd>
    </div>
  );
}

/** Pinned to UTC noon specifically to dodge the classic "YYYY-MM-DD parses
 * as the PREVIOUS day in a negative UTC-offset timezone" bug — midnight
 * UTC minus any negative offset rolls back a day; noon UTC never does for
 * any real-world offset. */
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function mostRecentMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffToMonday);
  return monday;
}

function formatShortDate(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

interface DayGroup {
  date: string;
  label: string;
  subtotal: number;
  shifts: MyShiftEarnings[];
}

interface PeriodGroup {
  key: string;
  label: string;
  subtotal: number;
  days: DayGroup[];
}

function buildDayGroups(shifts: MyShiftEarnings[]): DayGroup[] {
  const byDate = new Map<string, MyShiftEarnings[]>();
  for (const s of shifts) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  // Preserve the incoming (most-recent-first) order of distinct dates.
  const orderedDates: string[] = [];
  for (const s of shifts) {
    if (!orderedDates.includes(s.date)) orderedDates.push(s.date);
  }
  return orderedDates.map((date) => {
    const dayShifts = byDate.get(date)!;
    return {
      date,
      label: dayLabel(date),
      subtotal: round2(dayShifts.reduce((a, s) => a + s.payout.totalCorePayout, 0)),
      shifts: dayShifts,
    };
  });
}

function groupByWeek(shifts: MyShiftEarnings[]): PeriodGroup[] {
  const byWeekKey = new Map<string, MyShiftEarnings[]>();
  const orderedKeys: string[] = [];
  for (const s of shifts) {
    const monday = mostRecentMonday(parseDate(s.date));
    const key = monday.toISOString().slice(0, 10);
    if (!byWeekKey.has(key)) {
      byWeekKey.set(key, []);
      orderedKeys.push(key);
    }
    byWeekKey.get(key)!.push(s);
  }
  return orderedKeys.map((key) => {
    const weekShifts = byWeekKey.get(key)!;
    const monday = parseDate(key);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      key,
      label: `Week of ${formatShortDate(monday)} – ${formatShortDate(sunday)}`,
      subtotal: round2(weekShifts.reduce((a, s) => a + s.payout.totalCorePayout, 0)),
      days: buildDayGroups(weekShifts),
    };
  });
}

function groupByMonth(shifts: MyShiftEarnings[]): PeriodGroup[] {
  const byMonthKey = new Map<string, MyShiftEarnings[]>();
  const orderedKeys: string[] = [];
  for (const s of shifts) {
    const key = s.date.slice(0, 7); // "YYYY-MM"
    if (!byMonthKey.has(key)) {
      byMonthKey.set(key, []);
      orderedKeys.push(key);
    }
    byMonthKey.get(key)!.push(s);
  }
  return orderedKeys.map((key) => {
    const monthShifts = byMonthKey.get(key)!;
    const [year, month] = key.split("-").map(Number);
    return {
      key,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      subtotal: round2(monthShifts.reduce((a, s) => a + s.payout.totalCorePayout, 0)),
      days: buildDayGroups(monthShifts),
    };
  });
}

function round2(n: number): number {
  return Math.round((n + 1e-9) * 100) / 100;
}
