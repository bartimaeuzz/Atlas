import Link from "next/link";
import { loadShiftsList } from "@/lib/shift/loadShiftsList";
import { dayOfWeek } from "@/lib/schedule/weekMath";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ShiftsListPage() {
  // Phase C (2026-08-21): Settings is behind VIEW_SETTINGS, which
  // defaults to Admin+Partner -- so this shortcut would dead-end for
  // every Floor/Assistant Manager, on the page they use most. Hidden
  // rather than left to fail.
  const [shifts, canSeeSettings] = await Promise.all([loadShiftsList(), hasCapability("VIEW_SETTINGS")]);

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

      {shifts.length === 0 ? (
        <EmptyState message="No shifts yet." action={<LinkButton href="/shifts/new" size="sm">+ New shift</LinkButton>} />
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
