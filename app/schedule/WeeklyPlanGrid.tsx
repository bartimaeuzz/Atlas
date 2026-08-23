"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlannedAssignment, removePlannedAssignment } from "@/lib/actions/schedule";
import type { WeeklyPlanData, PlannedAssignmentRow } from "@/lib/schedule/loadWeeklyPlan";
import { toIso } from "@/lib/schedule/weekMath";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayOfWeekFor(dateIso: string): number {
  // Pinned to UTC noon, same convention as lib/schedule/weekMath.ts.
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Position × Date grid, one per period (Lunch/Dinner) — mirrors the
 * Staffing Targets grid's shape so the two pages feel like the same
 * tool. A cell's border turns red when it has fewer people than the
 * staffing target for that position/day/period — the "at a glance see
 * what's short" behavior Oliver asked for. Extra-coverage assignments
 * (YELLOW) get a highlighted background on their own name, independent
 * of whether the slot happens to be under/at/over target.
 *
 * Double-booking warning (2026-08-11, Oliver-reported): a person can't
 * physically work two positions in the same date+period slot, but
 * nothing in the data model stops a manager from adding them to both
 * via the manual add form (e.g. someone shows up in both Bartender and
 * Busser for the same Monday Dinner). Rather than block it outright —
 * a manager might occasionally mean it — flag it with a small warning
 * badge (hover for detail) so it's visible at a glance instead of
 * silently wrong.
 *
 * Inline quick-add (2026-08-11, Oliver): every cell also gets a small
 * dropdown so a manager can add someone directly in the grid instead
 * of using the separate form below — same addPlannedAssignment action,
 * called directly (like GenerateWeekButton/PublishWeekButton do)
 * rather than through useActionState, since this needs to live inside
 * a table cell, not a <form>. Every cell gets it, not just under-target
 * ones — Oliver confirmed he wants to be able to add extra people even
 * to an already-fully-staffed cell. The "extra coverage" (yellow) flag
 * only appears next to the dropdown once a person is picked, and is a
 * manual checkbox, never auto-set — Oliver's call: the app shouldn't
 * guess whether an add is "covering a known gap" vs "anticipating a
 * busy day," those mean different things to him.
 *
 * Vacancy-soon indicator (2026-08-11, Oliver): when an assignment's
 * employee is in the grace period before their template slot's RED
 * vacancy date (resignation/promotion — set on /schedule/templates),
 * their pill gets a red ring + tooltip. Deliberately NOT gated by
 * hideDiagnostics like the other warnings — Oliver's original design
 * intent for red was that it doubles as an internal "open shift, come
 * talk to me" signal staff should be able to see too, not just a
 * manager-only diagnostic.
 *
 * Read-only / preview modes (2026-08-11, Oliver): before publishing, he
 * wants to preview both as HE'D see it (all the warnings above, so he
 * can catch problems) and as STAFF will see it once it's live (no
 * manager-only diagnostics). Rather than build a second grid component,
 * this same component takes `readOnly` (hides quick-add + remove
 * buttons) and `hideDiagnostics` (hides the red under-target
 * highlight/badge and the orange double-booking badge, but keeps the
 * yellow extra-coverage highlight — that's relevant context for staff
 * too, not an internal diagnostic) so both preview modes and the
 * normal editable grid share one implementation.
 *
 * Moved up to app/schedule/ (2026-08-16, Oliver: "staff should see all
 * day in a week schedule view as well like manager diagnose view. but
 * no edit and no understaff sign... but can see ring color status")
 * from its original home under app/(protected)/schedule/plan/ so the
 * new staff-facing /me/schedule/week page can import the exact same
 * component (readOnly + hideDiagnostics, same as Preview's staff view)
 * instead of drifting into a second copy. This file has no page.tsx of
 * its own, so it doesn't add a route — same pattern already used for
 * MarkSeenOnMount.tsx living directly under app/(protected)/schedule/.
 *
 * Design-system restyle (2026-08-18): tokens swapped in wherever a direct
 * equivalent exists (danger/warning/success/primary/ink/border/paper).
 * Deliberately did NOT touch: the table layout itself, or the two
 * categorical colors that have no token (purple = on-leave, orange =
 * double-booking conflict) — inventing new tokens for a two-instance use
 * case is exactly the granularity/scope-creep pattern this project now
 * flags explicitly (see project_atlas_ui_design.md). A real stacked-card
 * mobile layout for this grid (today it only gets horizontal scroll on
 * small screens) is intentionally deferred to its own dedicated design
 * pass, same as Danger Zone and dark mode each were — this component is
 * too dense (vacancy/leave/swap rings, conflict badges, inline quick-add)
 * to restructure safely inside a token-restyle pass.
 *
 * 2026-08-18 (visual-audit follow-up): still not a full stacked-card
 * conversion — that's a real information-hierarchy decision (day-primary
 * vs. position-primary grouping on a narrow screen) that needs a scoping
 * conversation with Oliver, not a mechanical CSS pass, per the project's
 * "never assume" rule. What's safe to ship now without that conversation:
 * the two concrete usability gaps in the existing scroll-table stopgap —
 * losing track of which position row you're on while scrolling
 * horizontally (fixed with a sticky first column), and no visual signal
 * that the table scrolls at all on a narrow screen (fixed with a
 * mobile-only hint). Both are additive, don't change the grid's shape or
 * density, and don't foreclose whatever the real redesign decides.
 *
 * 2026-08-19 — that scoping conversation happened: Oliver asked for
 * day-primary specifically ("first column as days in a week (Vertically)
 * ... so we can see all people assigned position whole week"), and only
 * for read-only weekly views ("published schedule" — Preview, the
 * locked/published PublishedEditGate view, and staff's My Schedule
 * week), not the editable pre-publish planning grid. Scoped that way on
 * purpose: the editable grid's quick-add-per-cell UX is built around a
 * position×day×period cell, and re-deriving that from a day-primary
 * layout would be a much bigger, riskier change than what was actually
 * asked for. So `readOnly` mode now renders a genuinely different mobile
 * layout (a vertical list of days, each showing every position that has
 * either an assignment or — when diagnostics aren't hidden — an unmet
 * staffing target that day) alongside the existing desktop table
 * unchanged; `!readOnly` mode is completely untouched, still the single
 * scroll-table at every width. Positions with neither an assignment nor
 * a relevant gap are omitted from a day's card entirely (unlike the
 * desktop table, which always lists every position as a row) — that's a
 * deliberate difference, not an oversight: a focused per-day list
 * benefits from hiding rows with nothing to say, where the desktop grid
 * is meant to be an exhaustive overview. */
export function WeeklyPlanGrid({
  data,
  weekId,
  allEmployees,
  employeeAssignedPositionIds,
  readOnly = false,
  hideDiagnostics = false,
}: {
  data: WeeklyPlanData;
  weekId?: number;
  allEmployees?: { id: number; name: string }[];
  employeeAssignedPositionIds?: Record<number, number[]>;
  readOnly?: boolean;
  hideDiagnostics?: boolean;
}) {
  const positionNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of data.positions) map.set(p.id, p.name);
    return map;
  }, [data.positions]);

  // "employeeId:date:period" -> every positionId that employee is on for that slot
  const slotPositionsByEmployee = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const a of data.assignments) {
      const key = `${a.employeeId}:${a.date}:${a.period}`;
      const existing = map.get(key);
      if (existing) existing.push(a.positionId);
      else map.set(key, [a.positionId]);
    }
    return map;
  }, [data.assignments]);

  // positionId -> employees split into "usually works this role" vs "other"
  // — only needed in editable mode, since that's the only place the
  // quick-add dropdown renders.
  const employeesByPosition = useMemo(() => {
    const map = new Map<number, { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] }>();
    if (readOnly || !allEmployees || !employeeAssignedPositionIds) return map;
    for (const p of data.positions) {
      const eligible: { id: number; name: string }[] = [];
      const other: { id: number; name: string }[] = [];
      for (const emp of allEmployees) {
        const assignedIds = employeeAssignedPositionIds[emp.id] ?? [];
        (assignedIds.includes(p.id) ? eligible : other).push(emp);
      }
      map.set(p.id, { eligible, other });
    }
    return map;
  }, [data.positions, allEmployees, employeeAssignedPositionIds, readOnly]);

  // PHONE SHOWS ONE DAY AT A TIME (2026-08-23, Oliver). At 390px the
  // editing grid measured 728px wide against 310px of visible width --
  // 450px of the week, 62% of it, behind a horizontal scroll, with a
  // "swipe sideways" hint standing in for a phone layout. Desktop is
  // untouched and still shows all seven days.
  //
  // Defaults to today when today falls inside the week being viewed,
  // otherwise the first day: opening this on a phone is nearly always
  // about today or tomorrow, and landing on a week's Sunday when it is
  // Thursday would cost two taps every time.
  const todayIso = toIso(new Date());
  // DERIVED, not synced. A week changes under this component whenever
  // previous/next week navigation re-renders it with new dates, and a
  // stored selection would then point at a day that is no longer in the
  // week -- rendering an empty view that looks exactly like a legitimate
  // "nobody scheduled". Resolving it during render instead of correcting
  // it in an effect means there is no in-between frame to be wrong in,
  // and no cascading re-render (eslint's set-state-in-effect rule is
  // pointing at a real problem, not a style preference).
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate =
    pickedDate && data.dates.includes(pickedDate)
      ? pickedDate
      : data.dates.includes(todayIso)
        ? todayIso
        : data.dates[0];
  const setSelectedDate = setPickedDate;

  const dayIndex = data.dates.indexOf(selectedDate);
  const goDay = (delta: number) => {
    const next = data.dates[dayIndex + delta];
    if (next) setSelectedDate(next);
  };

  // Swipe left/right to change day. Only a clearly horizontal gesture
  // counts -- comparing dx against dy before acting is what keeps this
  // from eating vertical scrolling, which is the usual way a swipe
  // handler ruins a long page. The tabs above remain a complete
  // alternative: swipe is a shortcut, never the only route to a day.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goDay(dx < 0 ? 1 : -1);
  };

  return (
    <div className="space-y-8">
      {/* Day picker + sticky day header, phone only. Rendered once here
          rather than inside the period loop, so Lunch and Dinner for the
          chosen day read as one day rather than two separate lists. */}
      <div className="lg:hidden -mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
          {data.dates.map((date) => {
            const active = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-current={active ? "date" : undefined}
                className={
                  "shrink-0 min-h-11 px-3 rounded-[var(--radius-md)] border text-sm leading-tight " +
                  (active
                    ? "bg-[var(--primary)] text-white border-[var(--primary)] font-semibold"
                    : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)]")
                }
              >
                <span className="block text-[11px] opacity-80">{DAY_LABELS[dayOfWeekFor(date)]}</span>
                <span className="block font-medium">{Number(date.slice(8, 10))}</span>
              </button>
            );
          })}
        </div>
        <div className="sticky top-0 z-[2] bg-[var(--card)] border-b border-[var(--border)] py-2">
          <span className="font-semibold text-[var(--ink-900)]">{DAY_LABELS[dayOfWeekFor(selectedDate)]}</span>
          <span className="text-[var(--ink-500)] text-sm ml-2">{selectedDate}</span>
          {selectedDate === todayIso && <span className="text-xs text-[var(--primary)] ml-2">today</span>}
        </div>
      </div>

      {(["Lunch", "Dinner"] as const).map((period) => (
        <section key={period}>
          <h2 className="text-lg font-medium mb-3 text-[var(--ink-900)]">{period}</h2>
          {/* The phone shape, both modes (2026-08-23). This used to be
              readOnly-only; the manager building the week got a sideways
              -scrolling table and a "swipe sideways" hint instead. Same
              pieces as the desktop cell -- AssignmentPill and QuickAddCell
              -- just laid out per position instead of per column, so the
              two shapes cannot drift into behaving differently.

              Safe to render one day only because this grid saves per
              change (addPlannedAssignment / removePlannedAssignment fire
              per cell), not as one big form. /schedule/targets looks
              similar and is NOT like this: it posts the whole grid, which
              is why that screen hides columns instead of dropping them. */}
          <div className="lg:hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {(() => {
              const date = selectedDate;
              const dayOfWeek = dayOfWeekFor(date);
              const dayRows = data.positions
                .map((p) => {
                  const assignments = data.assignments.filter(
                    (a) => a.positionId === p.id && a.date === date && a.period === period
                  );
                  const target = data.targets[`${p.id}:${dayOfWeek}:${period}`] ?? 0;
                  return { position: p, assignments, target };
                })
                // When editing, every position stays visible -- you cannot add
                // someone to a row that is not on screen. Read-only hides the
                // empty ones, which is what makes it readable.
                .filter(({ assignments, target }) =>
                  !readOnly || assignments.length > 0 || (!hideDiagnostics && target > 0)
                );

              if (dayRows.length === 0) {
                return (
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3 text-xs text-[var(--ink-400)]">
                    Nobody scheduled for {period.toLowerCase()} this day.
                  </div>
                );
              }

              return (
                <div className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                  {dayRows.map(({ position, assignments, target }) => {
                    const underTarget = !hideDiagnostics && target > 0 && assignments.length < target;
                    return (
                      <div key={position.id} className={"px-3 py-2" + (underTarget ? " bg-[var(--danger-tint)]" : "")}>
                        <div className="text-xs text-[var(--ink-500)] mb-1">
                          {position.name}
                          {!hideDiagnostics && target > 0 && (
                            <span className={underTarget ? " ml-1 text-[var(--danger-700)] font-medium" : " ml-1"}>
                              ({assignments.length}/{target})
                            </span>
                          )}
                        </div>
                        {assignments.length === 0 ? (
                          <span className="text-xs text-[var(--ink-400)] italic">No one assigned</span>
                        ) : (
                          <div className="space-y-1">
                            {assignments.map((a) => {
                              const slotKey = `${a.employeeId}:${date}:${period}`;
                              const otherPositionIds = hideDiagnostics
                                ? []
                                : (slotPositionsByEmployee.get(slotKey) ?? []).filter((id) => id !== a.positionId);
                              const conflictPositionNames = [...new Set(otherPositionIds)].map(
                                (id) => positionNameById.get(id) ?? "?"
                              );
                              return (
                                <AssignmentPill
                                  key={a.id}
                                  assignment={a}
                                  conflictPositionNames={conflictPositionNames}
                                  readOnly={readOnly}
                                  vacatingSoon={a.vacatingSoon}
                                  onLeave={a.onLeave}
                                  swap={a.swap}
                                />
                              );
                            })}
                          </div>
                        )}
                        {!readOnly && weekId !== undefined && (
                          <QuickAddCell
                            weekId={weekId}
                            date={date}
                            period={period}
                            positionId={position.id}
                            employees={employeesByPosition.get(position.id) ?? { eligible: [], other: [] }}
                            alreadyAssignedIds={new Set(assignments.map((a) => a.employeeId))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
                <th className="py-1.5 pr-2 sticky left-0 z-[1] bg-[var(--card)]">Position</th>
                {data.dates.map((d) => (
                  <th key={d} className="py-1.5 text-left align-bottom">
                    <div>{DAY_LABELS[dayOfWeekFor(d)]}</div>
                    <div className="text-xs font-normal text-[var(--ink-400)]">{d.slice(5)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p, i) => {
                const prevCategory = i > 0 ? data.positions[i - 1].category : null;
                const showCategoryBreak = p.category !== prevCategory;
                return (
                  <tr key={p.id} className={"border-b border-[var(--border)] align-top" + (showCategoryBreak && i > 0 ? " border-t-2 border-t-[var(--border-strong)]" : "")}>
                    <td className="py-1.5 pr-2 whitespace-nowrap sticky left-0 z-[1] bg-[var(--card)]">
                      {p.name}
                      <span className="text-xs text-[var(--ink-400)] ml-1">({p.category})</span>
                    </td>
                    {data.dates.map((date) => {
                      const dayOfWeek = dayOfWeekFor(date);
                      const target = data.targets[`${p.id}:${dayOfWeek}:${period}`] ?? 0;
                      const cellAssignments = data.assignments.filter(
                        (a) => a.positionId === p.id && a.date === date && a.period === period
                      );
                      const underTarget = !hideDiagnostics && target > 0 && cellAssignments.length < target;
                      return (
                        <td key={date} className={"py-1.5 px-1 align-top" + (underTarget ? " bg-[var(--danger-tint)]" : "")}>
                          <div className="space-y-0.5">
                            {cellAssignments.map((a) => {
                              const slotKey = `${a.employeeId}:${date}:${period}`;
                              const otherPositionIds = hideDiagnostics
                                ? []
                                : (slotPositionsByEmployee.get(slotKey) ?? []).filter((id) => id !== a.positionId);
                              const conflictPositionNames = [...new Set(otherPositionIds)].map(
                                (id) => positionNameById.get(id) ?? "?"
                              );
                              return (
                                <AssignmentPill
                                  key={a.id}
                                  assignment={a}
                                  conflictPositionNames={conflictPositionNames}
                                  readOnly={readOnly}
                                  vacatingSoon={a.vacatingSoon}
                                  onLeave={a.onLeave}
                                  swap={a.swap}
                                />
                              );
                            })}
                            {!hideDiagnostics && target > 0 && (
                              <div className={"text-xs" + (underTarget ? " text-[var(--danger-700)] font-medium" : " text-[var(--ink-400)]")}>
                                {cellAssignments.length}/{target}
                              </div>
                            )}
                            {!readOnly && weekId !== undefined && (
                              <QuickAddCell
                                weekId={weekId}
                                date={date}
                                period={period}
                                positionId={p.id}
                                employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                                alreadyAssignedIds={new Set(cellAssignments.map((a) => a.employeeId))}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      ))}
    </div>
  );
}

const VACANCY_REASON_LABEL: Record<"RESIGNATION" | "PROMOTION" | "OTHER", string> = {
  RESIGNATION: "resigning",
  PROMOTION: "promoted out of this role",
  OTHER: "leaving this slot",
};

function AssignmentPill({
  assignment,
  conflictPositionNames,
  readOnly,
  vacatingSoon,
  onLeave,
  swap,
}: {
  assignment: PlannedAssignmentRow;
  conflictPositionNames: string[];
  readOnly: boolean;
  vacatingSoon: PlannedAssignmentRow["vacatingSoon"];
  onLeave: PlannedAssignmentRow["onLeave"];
  swap: PlannedAssignmentRow["swap"];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const hasConflict = conflictPositionNames.length > 0;

  const leaveTitle = onLeave
    ? `${assignment.employeeName} logged leave covering this date — needs coverage${onLeave.note ? `: "${onLeave.note}"` : ""}`
    : undefined;
  const vacancyTitle = vacatingSoon
    ? `${assignment.employeeName} is ${VACANCY_REASON_LABEL[vacatingSoon.reason]} as of ${vacatingSoon.startsOn} — this slot will need a replacement`
    : undefined;
  const swapTitle =
    swap?.status === "completed"
      ? `Covering for ${swap.requestingEmployeeName} via a completed shift swap`
      : swap?.status === "pending_manager_approval"
        ? `${assignment.employeeName} accepted a swap from ${swap.requestingEmployeeName}, awaiting manager approval (shift is within 3 days)`
        : undefined;

  return (
    <div
      title={[leaveTitle, vacancyTitle, swapTitle].filter(Boolean).join(" · ") || undefined}
      className={
        "flex items-center justify-between gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs " +
        (assignment.isExtraCoverage ? "bg-[var(--warning-tint)] text-[var(--warning-700)]" : "bg-[var(--paper)] text-[var(--ink-700)]") +
        (vacatingSoon ? " ring-1 ring-[var(--danger)]" : "") +
        (onLeave ? " ring-1 ring-purple-400" : "") +
        (swap?.status === "completed" ? " ring-1 ring-[var(--success)]" : "") +
        (swap?.status === "pending_manager_approval" ? " ring-1 ring-[var(--primary-border)]" : "")
      }
    >
      <span className="flex items-center gap-1">
        {assignment.employeeName}
        {vacatingSoon && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />}
        {onLeave && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />}
        {swap?.status === "completed" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />}
        {swap?.status === "pending_manager_approval" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0" />}
        {hasConflict && (
          <span
            title={`Also scheduled as ${conflictPositionNames.join(", ")} in this same slot — double check this is intentional.`}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none cursor-help shrink-0"
          >
            !
          </span>
        )}
      </span>
      {!readOnly && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await removePlannedAssignment(assignment.id);
              router.refresh();
            })
          }
          /* 7x16 CSS px before 2026-08-23 -- the smallest control in the
             app, and it removes a person from a shift. 44px on a phone,
             back to compact at lg where seven day-columns share the
             width and the pointer is a mouse. */
          className="inline-flex items-center justify-center min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 shrink-0 text-[var(--ink-400)] hover:text-[var(--danger-700)] disabled:opacity-50"
          title="Remove"
          aria-label="Remove from this shift"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Inline "add someone to this exact slot" control — a compact
 * dropdown (grouped: people who usually work this position, then
 * everyone else) plus an "extra coverage" checkbox that only appears
 * once a name is picked. Selecting a name does NOT auto-submit — you
 * need the "+" button, so there's a chance to check the extra-coverage
 * box first if this add is meant to be the yellow/busy-day case. */
function QuickAddCell({
  weekId,
  date,
  period,
  positionId,
  employees,
  alreadyAssignedIds,
}: {
  weekId: number;
  date: string;
  period: "Lunch" | "Dinner";
  positionId: number;
  employees: { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };
  alreadyAssignedIds: Set<number>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [isExtraCoverage, setIsExtraCoverage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  function handleAdd() {
    if (selectedId === "") return;
    const formData = new FormData();
    formData.set("weekId", String(weekId));
    formData.set("employeeId", String(selectedId));
    formData.set("positionId", String(positionId));
    formData.set("date", date);
    formData.set("period", period);
    if (isExtraCoverage) formData.set("isExtraCoverage", "on");
    setError(null);
    startTransition(async () => {
      const result = await addPlannedAssignment({ error: null }, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedId("");
      setIsExtraCoverage(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1">
        <select
          value={selectedId}
          disabled={isPending}
          onChange={(e) => {
            setSelectedId(e.target.value === "" ? "" : Number(e.target.value));
            setError(null);
          }}
          className="min-h-11 w-full text-sm px-2 lg:min-h-0 lg:w-auto lg:text-[10px] lg:px-0.5 lg:py-0.5 lg:max-w-[76px] border border-[var(--border-strong)] rounded-[var(--radius-sm)] text-[var(--ink-500)] bg-[var(--card)] disabled:opacity-50"
        >
          <option value="">+ Add</option>
          {eligible.length > 0 && (
            <optgroup label="Usually this role">
              {eligible.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          )}
          {other.length > 0 && (
            <optgroup label="Other">
              {other.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        {selectedId !== "" && (
          <>
            {/* 2026-08-23 visual audit: this measured 10x10 CSS px, the
                smallest control in the app and less than half WCAG 2.5.8's
                24x24 floor. Unlike the template grid there is only ONE of
                these and it appears in an inline editor that has already
                pushed the cell open for a <select> and two buttons, so the
                target can grow without costing the week view anything --
                min-h-11 on the label, which is what gets hit-tested, and
                the box itself only up to 16px so the row stays compact. */}
            <label
              className="flex items-center gap-1 min-h-11 text-[9px] text-[var(--ink-400)] cursor-pointer"
              title="Extra coverage — an anticipated busy day, not filling a known gap"
            >
              <input
                type="checkbox"
                checked={isExtraCoverage}
                onChange={(e) => setIsExtraCoverage(e.target.checked)}
                className="size-4 shrink-0 accent-[var(--primary)]"
              />
              extra
            </label>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending}
              className="text-[10px] bg-[var(--primary)] text-white rounded-[var(--radius-sm)] px-1 leading-tight disabled:opacity-50 hover:bg-[var(--primary-600)]"
            >
              +
            </button>
          </>
        )}
      </div>
      {error && <div className="text-[9px] text-[var(--danger-700)] mt-0.5">{error}</div>}
    </div>
  );
}
