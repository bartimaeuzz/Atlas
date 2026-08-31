"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { businessTodayIso } from "@/lib/formatDateTime";
import { useRouter } from "next/navigation";
import { addPlannedAssignment, removePlannedAssignment, replacePlannedAssignment } from "@/lib/actions/schedule";
import { Modal } from "@/components/ui/Modal";
import { Button, LinkButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { WeeklyPlanData, PlannedAssignmentRow } from "@/lib/schedule/loadWeeklyPlan";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Column template for the phone card table. Module scope because the
 * header row lives in the sticky block and the body rows live in the card
 * below it -- two elements that must agree on column widths, so they must
 * not each carry their own copy of this string. */
const PHONE_COLS = "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-2 divide-x divide-[var(--border)]";

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
  initialDate,
}: {
  data: WeeklyPlanData;
  weekId?: number;
  allEmployees?: { id: number; name: string }[];
  employeeAssignedPositionIds?: Record<number, number[]>;
  readOnly?: boolean;
  hideDiagnostics?: boolean;
  /** Preselect this date's phone day-tab on first render (e.g. arriving
   * from a swap card's "View shift" link). Falls back to today/Monday
   * when absent or outside the week. */
  initialDate?: string;
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

  // date:period -> everyone already working that slot (any position) —
  // feeds the on-leave replacement popup's "available" filter.
  const busyBySlot = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const a of data.assignments) {
      const key = `${a.date}:${a.period}`;
      const set = map.get(key) ?? new Set<number>();
      set.add(a.employeeId);
      map.set(key, set);
    }
    return map;
  }, [data.assignments]);

  // employeeId -> how many shifts they already hold this week — shown
  // next to each candidate so the manager can weigh who should take a
  // slot (Oliver, 2026-08-25), and used to sort fewest-first, the same
  // fairness tie-break autoFillWeek applies.
  const weekLoadByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of data.assignments) map.set(a.employeeId, (map.get(a.employeeId) ?? 0) + 1);
    return map;
  }, [data.assignments]);

  /** Available + capable replacements for one assignment: set up for
   * the position (same eligibility list quick-add uses) and not already
   * in that date+period slot, fewest-shifts-this-week first. The server
   * re-checks everything, including the replacement's own leave, which
   * isn't known here. */
  const replaceCandidatesFor = (a: PlannedAssignmentRow): { id: number; name: string; weekShifts: number }[] => {
    const busy = busyBySlot.get(`${a.date}:${a.period}`) ?? new Set<number>();
    return (employeesByPosition.get(a.positionId)?.eligible ?? [])
      .filter((e) => !busy.has(e.id))
      .map((e) => ({ ...e, weekShifts: weekLoadByEmployee.get(e.id) ?? 0 }))
      .sort((x, y) => x.weekShifts - y.weekShifts || x.name.localeCompare(y.name));
  };

  // date -> employeeId -> ["Server · Dinner", ...] — feeds quick-add's
  // "already working this day" confirm (Oliver, 2026-08-25: adding the
  // same person twice in a day went through with no warning).
  const dayLoadByEmployee = useMemo(() => {
    const map = new Map<string, Map<number, string[]>>();
    for (const a of data.assignments) {
      const inner = map.get(a.date) ?? new Map<number, string[]>();
      const labels = inner.get(a.employeeId) ?? [];
      labels.push(`${positionNameById.get(a.positionId) ?? "?"} · ${a.period}`);
      inner.set(a.employeeId, labels);
      map.set(a.date, inner);
    }
    return map;
  }, [data.assignments, positionNameById]);

  // Desktop merged table: per-position collapse (default expanded — a
  // collapsed row keeps its own short-staffed flag, see below).
  const [collapsedPositions, setCollapsedPositions] = useState<Set<number>>(new Set());
  const togglePosition = (id: number) =>
    setCollapsedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
  const todayIso = businessTodayIso();
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
      : initialDate && data.dates.includes(initialDate)
        ? initialDate
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
      {/* ONE wrapper around tabs + sticky header + card table (2026-08-24,
          second fix the same day). position:sticky only travels within its
          containing block, and the header's old wrapper ended at the
          header's own bottom edge -- so it never actually stuck; it
          scrolled straight off screen. Sharing a wrapper with the table
          gives the header the table's full height to stick through, which
          is the entire point of it. The earlier -mb-4 overlap fix survives:
          normal flow inside one wrapper cannot overlap. Swipe handlers sit
          up here too, so a swipe starting on the tabs or header also
          changes the day. */}
      <div className="lg:hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4">
          {data.dates.map((date) => {
            const active = date === selectedDate;
            const isToday = date === todayIso;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-current={active ? "date" : undefined}
                aria-label={`${DAY_LABELS[dayOfWeekFor(date)]} ${Number(date.slice(8, 10))}${isToday ? ", today" : ""}`}
                className={
                  // focus-visible:outline-2, not outline-2, and the offset on
                  // the base: Button.tsx records why -- in Tailwind v4 a
                  // variant-prefixed utility outranks its bare counterpart, so
                  // a plain outline-2 loses to focus-visible:outline and the
                  // ring renders at the browser default width. Measured here
                  // before this line existed: "auto 1px rgb(229,151,0)", the
                  // UA ring, where every other control in the app shows a 2px
                  // primary one.
                  "shrink-0 min-h-11 px-3 rounded-[var(--radius-md)] border text-sm leading-tight " +
                  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--primary)] " +
                  (active
                    ? "bg-[var(--primary)] text-white border-[var(--primary)] font-semibold"
                    : // Today keeps a primary edge even when another day is
                      // selected (2026-08-25 legibility pass — same "today must
                      // be findable" call as My Schedule's calendar, e7cf846).
                      isToday
                      ? "bg-[var(--primary-tint)] text-[var(--primary-700)] border-[var(--primary-border)] font-medium"
                      : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)]")
                }
              >
                <span className="block text-[11px] opacity-80">{DAY_LABELS[dayOfWeekFor(date)]}</span>
                <span className="block font-medium">{Number(date.slice(8, 10))}</span>
              </button>
            );
          })}
        </div>
        {/* Day name and column names stick together as ONE block (2026-08-24).
            They were two: the day bar was sticky and the table's own header
            row was not, so the column names slid underneath it and the first
            thing to disappear while scrolling was the labels telling you
            which column was Lunch. Sticking them jointly also means the
            column names survive a scroll through thirteen positions, which
            is the case that actually needs them. */}
        <div className="sticky top-0 z-[2] bg-[var(--card)] border-b border-[var(--border)] pt-2 pb-1.5">
          <div className="pb-1.5">
            <span className="font-semibold text-[var(--ink-900)]">{DAY_LABELS[dayOfWeekFor(selectedDate)]}</span>
            <span className="text-[var(--ink-500)] text-sm ml-2">{selectedDate}</span>
            {selectedDate === todayIso && <span className="text-xs text-[var(--primary)] ml-2">today</span>}
          </div>
          <div className={PHONE_COLS + " text-[11px] font-medium text-[var(--ink-500)]"}>
            <span>Position</span>
            <span>Lunch</span>
            <span>Dinner</span>
          </div>
        </div>

      {/* PHONE: one card table for the selected day (2026-08-24, Oliver).
          Row per position, Lunch and Dinner as columns, each staff name a
          small card in whichever period they work.

          Rendered ONCE, outside the period loop, which is the whole reason
          this replaced yesterday's shape: that one lived inside the loop and
          so could only ever show a single period at a time. Reading "is
          Bartender covered for both services" meant scrolling from the Lunch
          list to the Dinner list and matching the position name by eye. Here
          both periods for a position sit on one line.

          Still safe to render one day only because this grid saves per
          change (addPlannedAssignment / removePlannedAssignment fire per
          cell), not as one big form. /schedule/targets looks like the same
          problem and is NOT: it posts the whole grid, which is why that
          screen hides columns instead of dropping them. */}
      {/* Inside the shared wrapper there is no space-y to fight, so a plain
          mt-4 gives the 16px gap under the sticky header. */}
      <div className="mt-4">
        {(() => {
          const date = selectedDate;
          const dayOfWeek = dayOfWeekFor(date);
          const cellFor = (positionId: number, period: "Lunch" | "Dinner") => {
            const assignments = data.assignments.filter(
              (a) => a.positionId === positionId && a.date === date && a.period === period
            );
            const target = data.targets[`${positionId}:${dayOfWeek}:${period}`] ?? 0;
            return { assignments, target };
          };

          const rows = data.positions
            .map((p) => ({ position: p, lunch: cellFor(p.id, "Lunch"), dinner: cellFor(p.id, "Dinner") }))
            // Editing keeps every position on screen -- you cannot add someone
            // to a row that is not rendered. Read-only hides the ones with
            // nobody and no target, which is what keeps it readable.
            .filter(({ lunch, dinner }) =>
              !readOnly ||
              lunch.assignments.length > 0 ||
              dinner.assignments.length > 0 ||
              (!hideDiagnostics && (lunch.target > 0 || dinner.target > 0))
            );

          if (rows.length === 0) {
            return (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3 text-xs text-[var(--ink-400)]">
                Nobody scheduled this day.
              </div>
            );
          }

          // bg-card, not transparent (Oliver, 2026-08-25): the page's
          // --paper ground was showing through the bordered box while the
          // desktop table sits on a white card — same shell both sizes.
          return (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-1)] overflow-hidden">
              <div className="divide-y divide-[var(--border)]">
                {rows.map(({ position, lunch, dinner }, ri) => (
                  <Fragment key={position.id}>
                  {(ri === 0 || rows[ri - 1].position.category !== position.category) && (
                    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase text-[var(--ink-500)] bg-[var(--paper)]">
                      {position.category === "FOH" ? "FOH — Front of house" : "BOH — Back of house"}
                    </div>
                  )}
                  <div className={PHONE_COLS + " py-2 items-start"}>
                    {/* pt-[3px] is not a magic number: it is an AssignmentPill's
                        1px border plus its py-0.5, so the position name sits on
                        the same text line as the first staff card beside it
                        rather than 2.5px above it (measured, 2026-08-24). The
                        row reads left-to-right as one line, so the three
                        columns have to share a baseline. */}
                    <span className="text-sm lg:text-xs font-medium text-[var(--ink-900)] leading-snug pt-[3px]">{position.name}</span>
                    {(["Lunch", "Dinner"] as const).map((period) => {
                      const { assignments, target } = period === "Lunch" ? lunch : dinner;
                      const underTarget = !hideDiagnostics && target > 0 && assignments.length < target;
                      return (
                        // Tint the CELL, not the row. In a two-period row a row
                        // tint would say "this position is short" when only one
                        // service is -- the eye should land on the service that
                        // actually needs someone.
                        <div
                          key={period}
                          className={
                            "-my-1 -mx-1 px-1 py-1 rounded-[var(--radius-sm)] flex flex-col " +
                            (underTarget ? "bg-[var(--danger-tint)]" : "")
                          }
                        >
                          {/* Dash placeholder in edit mode too (2026-08-25,
                              Oliver: an empty cell floated its 0/1 count where
                              the name box sits in every other cell — the
                              placeholder keeps box → count → add stacking
                              identical everywhere). */}
                          {assignments.length === 0 ? (
                            // Same box as an AssignmentPill, minus the visible
                            // border and fill. block, not inline-block: inline
                            // would sit on the baseline of the parent's 16/24px
                            // line box and land 2px lower than the block-level
                            // pills. Before this, an 11px bare span sat 6px below
                            // the position name and 3.5px below a real name in
                            // the next column, so a row with a dash on one side
                            // and a person on the other had its three cells at
                            // three different heights.
                            <span className="block w-fit border border-transparent px-1.5 py-0.5 text-xs text-[var(--ink-400)]">—</span>
                          ) : (
                            <div className="space-y-1.5">
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
                                    vacatingSoon={a.vacatingSoon}
                                    onLeave={a.onLeave}
                                    swap={a.swap}
                                    positionName={position.name}
                                    replaceCandidates={!readOnly ? replaceCandidatesFor(a) : null}
                                  />
                                );
                              })}
                            </div>
                          )}
                          {!hideDiagnostics && target > 0 && (
                            <div className={"text-xs mt-0.5" + (underTarget ? " text-[var(--danger-700)] font-medium" : " text-[var(--ink-500)]")}>
                              {assignments.length}/{target}
                            </div>
                          )}
                          {!readOnly && weekId !== undefined && (
                            <div className="mt-auto">
<QuickAddCell
                              weekId={weekId}
                              date={date}
                              period={period}
                              positionId={position.id}
                              employees={employeesByPosition.get(position.id) ?? { eligible: [], other: [] }}
                              alreadyAssignedIds={new Set(assignments.map((a) => a.employeeId))}
                              positionName={position.name}
                              dayLoad={dayLoadByEmployee.get(date)}
                              target={target}
                              leaveByEmployee={data.leaveByEmployee}
                            />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })()}
        </div>
        {/* Phone legend for the status dots (words live on desktop badges
            and in the tap popup). */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--ink-500)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> On leave</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--danger)] inline-block" /> Leaving</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> Reassigned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-[3px] bg-[var(--warning-tint)] border border-[var(--warning-border)] inline-block" /> Extra coverage</span>
        </div>
      </div>

      {/* Desktop: ONE table with Lunch/Dinner as collapsible sub-rows per
          position (Oliver, 2026-08-25 — replaces the two stacked period
          tables; same shape as the Staffing Targets grid, so the two
          screens read as one tool). Collapse is per position, default
          expanded, and a collapsed row keeps its own diagnostics: the
          summary cell stays red with a "short" flag whenever either
          period is under target, so collapsing can never hide a gap. */}
      <section className="hidden lg:block">
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCollapsedPositions((prev) =>
                prev.size === data.positions.length ? new Set() : new Set(data.positions.map((p) => p.id))
              )
            }
          >
            {collapsedPositions.size === data.positions.length ? "▾ Expand all" : "▸ Collapse all"}
          </Button>
        </div>
        <div className="overflow-x-auto bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-1)] p-4">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
                <th className="py-1.5 pr-2 sticky left-0 z-[1] bg-[var(--card)]">Position</th>
                {data.dates.map((d) => {
                  const isToday = d === businessTodayIso();
                  return (
                    <th key={d} className="py-1.5 px-1.5 text-left align-bottom border-l border-[var(--border)]">
                      <div className={isToday ? "text-[var(--primary-700)] font-semibold" : "text-[var(--ink-700)]"}>
                        {DAY_LABELS[dayOfWeekFor(d)]}
                      </div>
                      <div className={"text-xs font-normal " + (isToday ? "text-[var(--primary-700)]" : "text-[var(--ink-500)]")}>
                        {d.slice(5)}
                        {isToday && <span className="ml-1">· today</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p, i) => {
                const prevCategory = i > 0 ? data.positions[i - 1].category : null;
                const showCategoryBreak = p.category !== prevCategory;
                const isCollapsed = collapsedPositions.has(p.id);
                const cellDataFor = (date: string, period: "Lunch" | "Dinner") => {
                  const dayOfWeek = dayOfWeekFor(date);
                  const target = data.targets[`${p.id}:${dayOfWeek}:${period}`] ?? 0;
                  const cellAssignments = data.assignments.filter(
                    (a) => a.positionId === p.id && a.date === date && a.period === period
                  );
                  const underTarget = !hideDiagnostics && target > 0 && cellAssignments.length < target;
                  return { target, cellAssignments, underTarget };
                };
                return (
                  <Fragment key={p.id}>
                  {showCategoryBreak && (
                    <tr className="border-b border-[var(--border)]">
                      <td colSpan={8} className="pt-3 pb-1 text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase sticky left-0">
                        {p.category === "FOH" ? "FOH — Front of house" : "BOH — Back of house"}
                      </td>
                    </tr>
                  )}
                  {/* Position header row — the whole first cell toggles. */}
                  <tr className={"align-top" + (isCollapsed ? " border-b border-[var(--border)]" : "")}>
                    <td className="py-1 pr-2 whitespace-nowrap sticky left-0 z-[1] bg-[var(--card)]">
                      <button
                        type="button"
                        onClick={() => togglePosition(p.id)}
                        aria-expanded={!isCollapsed}
                        className="flex items-center gap-1 font-medium text-[var(--ink-900)] min-h-6 hover:text-[var(--primary-700)]"
                      >
                        {/* Was 10px (Oliver: too small to read as a control).
                            14px + ink-500 keeps it subordinate to the name but
                            visibly a disclosure arrow. */}
                        <span aria-hidden className="text-sm leading-none text-[var(--ink-500)] w-4">
                          {isCollapsed ? "▸" : "▾"}
                        </span>
                        {p.name}
                      </button>
                    </td>
                    {data.dates.map((date) => {
                      if (!isCollapsed) return <td key={date} className="border-l border-[var(--border)]" />;
                      const lunch = cellDataFor(date, "Lunch");
                      const dinner = cellDataFor(date, "Dinner");
                      const total = lunch.cellAssignments.length + dinner.cellAssignments.length;
                      const short = lunch.underTarget || dinner.underTarget;
                      return (
                        <td key={date} className={"py-1 px-1.5 text-xs border-l border-[var(--border)]" + (short ? " bg-[var(--danger-tint)]" : "")}>
                          <span className={short ? "text-[var(--danger-700)] font-medium" : "text-[var(--ink-500)]"}>
                            {total}
                            {short && " · short"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {!isCollapsed &&
                    (["Lunch", "Dinner"] as const).map((period, pi) => (
                      <tr
                        key={period}
                        className={
                          "align-top border-b " +
                          (pi === 1
                            ? "border-[var(--border)]"
                            : // Dashed line between the Lunch and Dinner
                              // sub-rows (Oliver, 2026-08-25) — softer than
                              // the solid border that closes the position.
                              "border-dashed border-[var(--border)]")
                        }
                      >
                        <td className="py-1.5 pr-2 pl-4 whitespace-nowrap sticky left-0 z-[1] bg-[var(--card)] text-xs text-[var(--ink-500)]">
                          {period}
                        </td>
                        {data.dates.map((date) => {
                          const { target, cellAssignments, underTarget } = cellDataFor(date, period);
                          // h-px + h-full: the standard table-cell trick so the
                          // inner flex column can fill the row height and pin
                          // + Add to the bottom edge (Oliver, 2026-08-25 — cells
                          // with different pill counts left the add controls at
                          // ragged heights across a row).
                          return (
                            <td key={date} className={"h-px py-1.5 px-1.5 align-top border-l border-[var(--border)]" + (underTarget ? " bg-[var(--danger-tint)]" : "")}>
                              <div className="h-full flex flex-col gap-0.5">
                                {cellAssignments.length === 0 && (
                                  <span className="block w-fit border border-transparent px-1.5 py-0.5 text-xs text-[var(--ink-400)]">
                                    —
                                  </span>
                                )}
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
                                      vacatingSoon={a.vacatingSoon}
                                      onLeave={a.onLeave}
                                      swap={a.swap}
                                      positionName={p.name}
                                      replaceCandidates={!readOnly ? replaceCandidatesFor(a) : null}
                                    />
                                  );
                                })}
                                {!hideDiagnostics && target > 0 && (
                                  <div className={"text-xs" + (underTarget ? " text-[var(--danger-700)] font-medium" : " text-[var(--ink-500)]")}>
                                    {cellAssignments.length}/{target}
                                  </div>
                                )}
                                {!readOnly && weekId !== undefined && (
                                  <div className="mt-auto">
                                    <QuickAddCell
                                      weekId={weekId}
                                      date={date}
                                      period={period}
                                      positionId={p.id}
                                      employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                                      alreadyAssignedIds={new Set(cellAssignments.map((a) => a.employeeId))}
                                      positionName={p.name}
                                      dayLoad={dayLoadByEmployee.get(date)}
                                      target={target}
                                      leaveByEmployee={data.leaveByEmployee}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
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
  vacatingSoon,
  onLeave,
  swap,
  positionName,
  replaceCandidates,
}: {
  assignment: PlannedAssignmentRow;
  conflictPositionNames: string[];
  vacatingSoon: PlannedAssignmentRow["vacatingSoon"];
  onLeave: PlannedAssignmentRow["onLeave"];
  swap: PlannedAssignmentRow["swap"];
  positionName?: string;
  /** Non-null only for an editable on-leave pill: the people who could
   * take this slot. Makes the name itself a button that opens the
   * replacement popup (Oliver, 2026-08-25). */
  replaceCandidates?: { id: number; name: string; weekShifts: number }[] | null;
}) {
  const [replacing, setReplacing] = useState(false);
  const hasConflict = conflictPositionNames.length > 0;

  const leaveTitle = onLeave
    ? `${assignment.employeeName} logged leave covering this date — needs coverage${onLeave.note ? `: "${onLeave.note}"` : ""}`
    : undefined;
  const vacancyTitle = vacatingSoon
    ? `${assignment.employeeName} is ${VACANCY_REASON_LABEL[vacatingSoon.reason]} as of ${vacatingSoon.startsOn} — this slot will need a replacement`
    : undefined;
  const swapTitle =
    swap?.status === "open"
      ? `${assignment.employeeName} has offered this shift for swap — nobody has taken it yet`
      : swap?.status === "completed"
      ? `Covering for ${swap.requestingEmployeeName} via a completed shift swap`
      : swap?.status === "pending_manager_approval"
        ? `${assignment.employeeName} accepted a swap from ${swap.requestingEmployeeName}, awaiting manager approval (shift is within 3 days)`
        : undefined;
  const reassignedTitle =
    assignment.sourceType === "REASSIGNED"
      ? `${assignment.employeeName} was put on this shift by a manager after the week was published`
      : undefined;

  const pillTitle = [leaveTitle, vacancyTitle, swapTitle, reassignedTitle].filter(Boolean).join(" · ") || undefined;
  const PillTag = replaceCandidates ? "button" : "div";
  return (
    <>
    <PillTag
      type={replaceCandidates ? "button" : undefined}
      onClick={replaceCandidates ? () => setReplacing(true) : undefined}
      title={pillTitle ?? (replaceCandidates ? `Tap for options — remove ${assignment.employeeName} or hand this shift to someone else` : undefined)}
      className={
        // Whole box is the tap target in edit mode (Oliver, 2026-08-25 —
        // was just the name).
        (replaceCandidates ? "w-full text-left cursor-pointer hover:brightness-95 " : "") +
        // Each person is a card with a visible edge (2026-08-24). They were
        // already on separate lines -- measured 20px tall, 2px apart -- but
        // with no border and a --paper fill against a --card cell, two of
        // them read as one grey lump with a hairline through it. Oliver saw
        // that as "people on the same line", and the line break was never
        // the missing part: the boundary was.
        // 2026-08-25 legibility pass, round two (Oliver: "still hard to
        // read"): assigned people now use the same primary-tint chip the
        // Person Schedule and My Schedule calendars use — the old white
        // outlined pill read as an empty input box, not an assignment.
        // Phone gets 14px text; lg drops back to 12px for grid density.
        "flex items-center justify-between gap-1 rounded-[var(--radius-sm)] border px-1.5 py-1 lg:py-0.5 text-sm lg:text-xs font-medium " +
        (assignment.isExtraCoverage
          ? "bg-[var(--warning-tint)] text-[var(--warning-700)] border-[var(--warning-border)]"
          : "bg-[var(--primary-tint)] text-[var(--primary-700)] border-[var(--primary-border)]") +
        (vacatingSoon ? " ring-1 ring-[var(--danger)]" : "") +
        (onLeave ? " ring-1 ring-purple-400" : "") +
        (swap?.status === "completed" ? " ring-1 ring-[var(--success)]" : "") +
        (swap?.status === "pending_manager_approval" ? " ring-1 ring-[var(--primary-border)]" : "") +
        // Dashed outline = "still floating": the shift is offered for
        // swap and nobody has taken it yet (Oliver, 2026-08-25). Same
        // blue family as swap-pending, one step earlier.
        (swap?.status === "open" ? " outline-dashed outline-1 outline-[var(--primary)] outline-offset-1" : "") +
        (assignment.sourceType === "REASSIGNED" ? " ring-1 ring-teal-400" : "")
      }
    >
      <span className="flex flex-wrap items-center gap-1 min-w-0">
        {/* Dotted underline kept as the "this is tappable" cue even though
            the whole box is now the button (Oliver, 2026-08-25). */}
        <span className={replaceCandidates ? "underline decoration-dotted underline-offset-2" : undefined}>
          {assignment.employeeName}
        </span>
        {/* Status text badges, not 1.5px dots (Oliver, 2026-08-25 — same
            call as the "swapped" badge: a word survives where a dot is
            invisible; fills keep meaning kind-of-shift, badges mean
            something needs attention). */}
        {/* Phone: 8px status dot + legend below the grid (Oliver,
            2026-08-25 — the word badges overflowed the chip on narrow
            cells; the tap popup still spells the status out in words).
            Desktop keeps the text badge. */}
        {vacatingSoon && (
          <>
            <span aria-label="leaving" className="lg:hidden w-2 h-2 rounded-full bg-[var(--danger)] shrink-0" />
            <span className="hidden lg:inline text-[10px] leading-tight px-1 rounded-[var(--radius-sm)] bg-[var(--danger-tint)] text-[var(--danger-700)] border border-[var(--danger-border)] shrink-0">
              leaving
            </span>
          </>
        )}
        {onLeave && (
          <>
            <span aria-label="on leave" className="lg:hidden w-2 h-2 rounded-full bg-purple-500 shrink-0" />
            <span className="hidden lg:inline text-[10px] leading-tight px-1 rounded-[var(--radius-sm)] bg-purple-100 text-purple-700 border border-purple-300 shrink-0">
              on leave
            </span>
          </>
        )}
        {/* Text badge, not just the old 1.5px dot (Oliver, 2026-08-25: the
            dot+ring was invisible to him — "should be highlight somehow so
            we can identify it was swapped by staff"). Word + color, never
            color alone. */}
        {swap?.status === "completed" && (
          <span className="text-[11px] lg:text-[10px] font-semibold leading-tight px-1.5 py-px rounded-[var(--radius-sm)] bg-[var(--success-tint)] text-[var(--success-700)] border border-[var(--success-border)] shrink-0">
            swapped
          </span>
        )}
        {/* Teal, a categorical color like purple/orange (no token — three
            uses now): manager-forced change on a published week, distinct
            from green "swapped" = staff traded voluntarily. */}
        {assignment.sourceType === "REASSIGNED" && (
          <>
            <span aria-label="reassigned" className="lg:hidden w-2 h-2 rounded-full bg-teal-500 shrink-0" />
            <span className="hidden lg:inline text-[10px] leading-tight px-1 rounded-[var(--radius-sm)] bg-teal-100 text-teal-700 border border-teal-300 shrink-0">
              reassigned
            </span>
          </>
        )}
        {/* Swap-family badges show the word on BOTH viewports (option C,
            Oliver 2026-08-25) — short words, and the pill wraps instead of
            overflowing. offered = white + thick dashed border + bold dark
            text (the old thin 10px blue was unreadable); pending = solid
            blue with white text; swapped keeps its green tint. */}
        {swap?.status === "open" && (
          <span className="text-[11px] lg:text-[10px] font-semibold leading-tight px-1.5 py-px rounded-[var(--radius-sm)] bg-[var(--card)] text-[var(--primary-700)] border-[1.5px] border-dashed border-[var(--primary)] shrink-0">
            offered
          </span>
        )}
        {swap?.status === "pending_manager_approval" && (
          <span className="text-[11px] lg:text-[10px] font-semibold leading-tight px-1.5 py-px rounded-[var(--radius-sm)] bg-[var(--primary)] text-white shrink-0">
            pending
          </span>
        )}
        {hasConflict && (
          <span
            title={`Also scheduled as ${conflictPositionNames.join(", ")} in this same slot — double check this is intentional.`}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none cursor-help shrink-0"
          >
            !
          </span>
        )}
      </span>
    </PillTag>
      {replaceCandidates && (
        <AssignmentActionsDialog
          open={replacing}
          onClose={() => setReplacing(false)}
          assignment={assignment}
          positionName={positionName ?? ""}
          candidates={replaceCandidates}
          onLeaveNote={onLeave ? (onLeave.note ?? "on leave") : null}
          conflictPositionNames={conflictPositionNames}
          swap={swap}
          vacatingSoon={vacatingSoon}
        />
      )}
    </>
  );
}

/** Per-assignment actions popup (Oliver, 2026-08-25 — grew out of the
 * on-leave replacement dialog the same day): tap a name in the editable
 * grid to remove them from the slot or hand it to someone who is set up
 * for the position and free that date+period. The server re-validates
 * everything — including a candidate's own leave, which the client
 * can't see — so a rejected pick surfaces here as a banner instead of
 * failing silently. */
function AssignmentActionsDialog({
  open,
  onClose,
  assignment,
  positionName,
  candidates,
  onLeaveNote,
  conflictPositionNames,
  swap,
  vacatingSoon,
}: {
  open: boolean;
  onClose: () => void;
  assignment: PlannedAssignmentRow;
  positionName: string;
  candidates: { id: number; name: string; weekShifts: number }[];
  onLeaveNote: string | null;
  conflictPositionNames: string[];
  swap: PlannedAssignmentRow["swap"];
  vacatingSoon: PlannedAssignmentRow["vacatingSoon"];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function pick(employeeId: number) {
    setError(null);
    startTransition(async () => {
      const result = await replacePlannedAssignment(assignment.id, employeeId);
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await removePlannedAssignment(assignment.id);
        if (result?.error) {
          // e.g. an open swap request still references this shift -- the
          // action refuses with the reason, shown here instead of closing.
          setError(result.error);
          return;
        }
        onClose();
        router.refresh();
      } catch {
        setError("Couldn't remove them. Nothing was changed — try again.");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="assignment-actions-title" width={380}>
      <div className="p-4">
        <h2 id="assignment-actions-title" className="text-base font-semibold text-[var(--ink-900)] mb-1">
          {assignment.employeeName} — {positionName}
        </h2>
        <p className="text-sm text-[var(--ink-500)] mb-3">
          {assignment.date} · {assignment.period}
          {onLeaveNote && (
            <span className="block text-purple-700 mt-0.5">
              On leave this date{onLeaveNote !== "on leave" ? ` — "${onLeaveNote}"` : ""}. This slot
              needs coverage.
            </span>
          )}
          {conflictPositionNames.length > 0 && (
            <span className="block text-orange-700 mt-0.5">
              Also scheduled as {conflictPositionNames.join(", ")} in this same slot.
            </span>
          )}
          {/* Every status the pill can wear gets its sentence here too
              (Oliver, 2026-08-25) — the popup is where a phone user reads
              what a dot means. */}
          {assignment.sourceType === "REASSIGNED" && (
            <span className="block text-teal-700 mt-0.5">
              Was reassigned{assignment.reassignedFromName ? ` from ${assignment.reassignedFromName}` : ""} to{" "}
              {assignment.employeeName} by a manager after the week was published.
            </span>
          )}
          {assignment.isExtraCoverage && (
            <span className="block text-[var(--warning-700)] mt-0.5">
              Was added as extra coverage (on top of the normal staffing).
            </span>
          )}
          {swap?.status === "completed" && (
            <span className="block text-[var(--success-700)] mt-0.5">
              Got this shift via a swap from {swap.requestingEmployeeName}.
            </span>
          )}
          {swap?.status === "pending_manager_approval" && (
            <span className="block text-[var(--primary-700)] mt-0.5">
              Accepted a swap from {swap.requestingEmployeeName} — awaiting manager approval.
            </span>
          )}
          {swap?.status === "open" && (
            <span className="block text-[var(--primary-700)] mt-0.5">
              Has offered this shift for swap — nobody has taken it yet.
            </span>
          )}
          {vacatingSoon && (
            <span className="block text-[var(--danger-700)] mt-0.5">
              Is {VACANCY_REASON_LABEL[vacatingSoon.reason]} as of {vacatingSoon.startsOn} — this slot
              will need a replacement.
            </span>
          )}
        </p>
        <div className="mb-3 space-y-2">
          <LinkButton
            href={`/schedule/plan/person?employeeId=${assignment.employeeId}&month=${assignment.date}`}
            variant="secondary"
            size="sm"
            className="w-full"
          >
            View {assignment.employeeName}&apos;s month schedule
          </LinkButton>
          <Button variant="destructive-outline" size="sm" disabled={isPending} onClick={remove} className="w-full">
            Remove from this shift
          </Button>
        </div>
        <p className="text-xs text-[var(--ink-500)] mb-1.5">Or hand the shift to someone free:</p>
        {error && (
          <div className="mb-3">
            <Banner tone="danger" title="Couldn't reassign" description={error} />
          </div>
        )}
        {candidates.length === 0 ? (
          <p className="text-sm text-[var(--ink-500)] border border-dashed border-[var(--border-strong)] rounded-[var(--radius-md)] p-3">
            Nobody is both free this {assignment.period.toLowerCase()} and set up for {positionName}.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)]">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-[var(--ink-900)]">
                  {c.name}
                  <span className="block text-xs text-[var(--ink-500)]">
                    {c.weekShifts === 0 ? "no shifts this week" : `${c.weekShifts} shift${c.weekShifts === 1 ? "" : "s"} this week`}
                  </span>
                </span>
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => pick(c.id)}>
                  Swap
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
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
  positionName,
  dayLoad,
  target = 0,
  leaveByEmployee,
}: {
  weekId: number;
  date: string;
  period: "Lunch" | "Dinner";
  positionId: number;
  employees: { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };
  alreadyAssignedIds: Set<number>;
  positionName?: string;
  /** employeeId -> what they already work this date ("Server · Dinner"). */
  dayLoad?: Map<number, string[]>;
  /** Staffing target for this cell — 0 when none set. */
  target?: number;
  /** employeeId -> leave ranges touching the week (from WeeklyPlanData). */
  leaveByEmployee?: Record<number, { startDate: string; endDate: string; note: string | null }[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [isExtraCoverage, setIsExtraCoverage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDouble, setConfirmingDouble] = useState(false);
  const [askingExtra, setAskingExtra] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  const selectedName =
    selectedId === "" ? "" : ([...employees.eligible, ...employees.other].find((e) => e.id === selectedId)?.name ?? "This person");
  const existingToday = selectedId === "" ? [] : (dayLoad?.get(selectedId) ?? []);
  const selectedLeave =
    selectedId === ""
      ? null
      : ((leaveByEmployee?.[selectedId] ?? []).find((l) => l.startDate <= date && l.endDate >= date) ?? null);

  const overTarget = target > 0 && alreadyAssignedIds.size >= target;

  // Two ask-first gates before an add lands (Oliver, 2026-08-25):
  // over-target asks "is this an extra?" (the human decides, the app
  // still never guesses — his 2026-08-11 rule); a same-day double
  // booking asks for confirmation. When both apply, the extra dialog
  // carries the double-shift note too, so only one popup ever shows.
  function requestAdd() {
    if (selectedId === "") return;
    // Leave first — it's the "are you sure this person is even here?"
    // question, ahead of staffing-shape questions (Oliver, 2026-08-25).
    if (selectedLeave) {
      setConfirmingLeave(true);
      return;
    }
    if (overTarget && !isExtraCoverage) {
      setAskingExtra(true);
      return;
    }
    if (existingToday.length > 0) {
      setConfirmingDouble(true);
      return;
    }
    handleAdd();
  }

  /** Continues the gate chain after the leave confirm. */
  function afterLeaveConfirmed() {
    setConfirmingLeave(false);
    if (overTarget && !isExtraCoverage) {
      setAskingExtra(true);
      return;
    }
    if (existingToday.length > 0) {
      setConfirmingDouble(true);
      return;
    }
    handleAdd();
  }

  function handleAdd(extraOverride?: boolean) {
    if (selectedId === "") return;
    const formData = new FormData();
    formData.set("weekId", String(weekId));
    formData.set("employeeId", String(selectedId));
    formData.set("positionId", String(positionId));
    formData.set("date", date);
    formData.set("period", period);
    if (extraOverride ?? isExtraCoverage) formData.set("isExtraCoverage", "on");
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
              onClick={requestAdd}
              disabled={isPending}
              // min 24px box (2026-08-24 audit -- it had no size guarantee
              // at all); kept compact rather than 44 because the row is
              // dense and the adjacent select is the primary control.
              className="text-[10px] bg-[var(--primary)] text-white rounded-[var(--radius-sm)] px-2 min-h-6 min-w-6 leading-tight disabled:opacity-50 hover:bg-[var(--primary-700)]"
            >
              +
            </button>
          </>
        )}
      </div>
      {error && <div className="text-[9px] text-[var(--danger-700)] mt-0.5">{error}</div>}
      <ConfirmDialog
        open={confirmingLeave}
        onClose={() => setConfirmingLeave(false)}
        onConfirm={afterLeaveConfirmed}
        title={`${selectedName} is on leave that day`}
        description={`${selectedName} has leave covering ${date}${selectedLeave?.note ? ` ("${selectedLeave.note}")` : ""}. They may not be available — add them anyway?`}
        confirmLabel="Add anyway"
      />
      <ConfirmDialog
        open={confirmingDouble}
        onClose={() => setConfirmingDouble(false)}
        onConfirm={() => {
          setConfirmingDouble(false);
          handleAdd();
        }}
        loading={isPending}
        title={`Add ${selectedName} again today?`}
        description={`${selectedName} is already working this day: ${existingToday.join(", ")}. Adding them here (${positionName ?? "this position"} · ${period}) means a double shift.`}
        confirmLabel="Add anyway"
      />
      <Modal open={askingExtra} onClose={() => setAskingExtra(false)} labelledBy="ask-extra-title" width={380}>
        <div className="p-4">
          <h2 id="ask-extra-title" className="text-base font-semibold text-[var(--ink-900)] mb-1">
            Is {selectedName} an extra?
          </h2>
          <p className="text-sm text-[var(--ink-500)] mb-3">
            {positionName ?? "This position"} is already at {alreadyAssignedIds.size}/{target} for this{" "}
            {period.toLowerCase()}. An extra (yellow) means busy-day coverage on top of the normal
            staffing.
            {existingToday.length > 0 &&
              ` Note: ${selectedName} is already working this day (${existingToday.join(", ")}), so this is also a double shift.`}
          </p>
          <div className="space-y-2">
            <Button
              size="sm"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                setAskingExtra(false);
                handleAdd(true);
              }}
            >
              Yes — add as extra
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={isPending}
              onClick={() => {
                setAskingExtra(false);
                handleAdd(false);
              }}
            >
              No — regular add
            </Button>
            <Button size="sm" variant="ghost" className="w-full" disabled={isPending} onClick={() => setAskingExtra(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
