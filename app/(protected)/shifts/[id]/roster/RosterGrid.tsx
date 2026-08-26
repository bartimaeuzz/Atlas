"use client";

import { useMemo, useState, useTransition, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  addRosterEntry,
  removeRosterEntry,
  setAttendanceMark,
  clearAttendanceMark,
  removeRosterEntryAbsent,
  replaceWithSubstitute,
} from "@/lib/actions/shift";
import type { RosterPageEntry, RosterAttendanceMark } from "@/lib/shift/loadRosterPageData";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Banner } from "@/components/ui/Banner";
import { XIcon } from "@/components/ui/icons";

type EmployeeOptionGroups = { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };

/** Position-grid redesign of the roster page (2026-08-11, Oliver: wanted
 * it to read like the Schedule Planner's weekly grid — headcount target
 * per position, plus an inline dropdown to add someone as a last-minute
 * change right before the closing report). One position per row (this
 * page is always for one specific date+period, so there's no day-column
 * axis like the weekly grid has); each row shows who's assigned, the
 * target count, and a quick-add control.
 *
 * The multi-role guard uses the shared <ConfirmDialog> instead of a
 * raw window.confirm() — one of the 5 real gaps caught in the
 * 2026-08-16 verification pass.
 *
 * 2026-08-25 (Oliver's injury/no-show scenario): a person's chip is now
 * a button opening the day-of attendance popup — Mark late, Replace with
 * a substitute, or Absent-remove, the last two recording the fixed
 * reason (No show / Emergency). The X keeps its old meaning: "added by
 * mistake", removes without recording anything. Absence marks show in
 * the "Out today" list below the table with an undo. */
export function RosterGrid({
  shiftId,
  positions,
  roster,
  targets,
  allEmployees,
  employeeAssignedPositionIds,
  readOnly,
  marks,
  weekShiftCounts,
}: {
  shiftId: number;
  positions: { id: number; name: string; category: "FOH" | "BOH" }[];
  roster: RosterPageEntry[];
  targets: Record<number, number>;
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  employeeAssignedPositionIds: Record<number, number[]>;
  readOnly: boolean;
  marks: RosterAttendanceMark[];
  weekShiftCounts: Record<number, number>;
}) {
  const roleCountByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of roster) map.set(r.employeeId, (map.get(r.employeeId) ?? 0) + 1);
    return map;
  }, [roster]);

  const employeesByPosition = useMemo(() => {
    const map = new Map<number, EmployeeOptionGroups>();
    for (const p of positions) {
      const eligible: { id: number; name: string }[] = [];
      const other: { id: number; name: string }[] = [];
      for (const emp of allEmployees) {
        const assignedIds = employeeAssignedPositionIds[emp.id] ?? [];
        (assignedIds.includes(p.id) ? eligible : other).push(emp);
      }
      map.set(p.id, { eligible, other });
    }
    return map;
  }, [positions, allEmployees, employeeAssignedPositionIds]);

  // Absence marks belong to people no longer on the roster (no-show /
  // emergency removed them); late people are still on it and carry their
  // badge on the chip instead.
  const rosteredIds = new Set(roster.map((r) => r.employeeId));
  const outToday = marks.filter((m) => !rosteredIds.has(m.employeeId));

  // Floor Manager leads (Oliver, 2026-08-24): the shift's responsible
  // person reads first, then the two kitchens-of-work. Grouped by name
  // because "Floor Manager" is a position row, not a category of its own.
  const floorManagers = positions.filter((p) => p.name === "Floor Manager");
  const rest = positions.filter((p) => p.name !== "Floor Manager");
  const groups: { header: string; items: typeof positions }[] = [
    { header: "Floor Manager", items: floorManagers },
    { header: "FOH — Front of house", items: rest.filter((p) => p.category === "FOH") },
    { header: "BOH — Back of house", items: rest.filter((p) => p.category === "BOH") },
  ].filter((g) => g.items.length > 0);

  // Card-table shell since 2026-08-25 (Oliver: "try change data into
  // table") -- same visual language as the shifts month view and the
  // ledger lists: one bordered card, a Position | People header row,
  // labeled FOH/BOH section rows inside the table per the locked
  // calendar/grid conventions.
  return (
    <>
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
      <div className="grid grid-cols-[minmax(96px,1fr)_minmax(0,2.2fr)] gap-2 px-3 py-2 text-[11px] font-medium text-[var(--ink-500)] border-b border-[var(--border)] bg-[var(--card)]">
        <span>Position</span>
        <span>People</span>
      </div>
      {groups.map((group) => (
        <div key={group.header}>
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)] bg-[var(--paper)] border-b border-[var(--border)]">
            {group.header}
          </div>
          <div className="divide-y divide-[var(--border)] border-b border-[var(--border)] last:border-b-0">
            {group.items.map((p) => {
              const cellEntries = roster.filter((r) => r.positionId === p.id);
              const target = targets[p.id] ?? 0;
              const underTarget = target > 0 && cellEntries.length < target;
              // Over target warns, never blocks (Oliver, 2026-08-24) --
              // extra coverage on a busy day is legitimate, it just
              // should not pass silently.
              const overTarget = target > 0 && cellEntries.length > target;

              return (
                <div
                  key={p.id}
                  className={
                    "grid grid-cols-[minmax(96px,1fr)_minmax(0,2.2fr)] gap-2 px-3 py-2.5 " +
                    (underTarget ? "bg-[var(--danger-tint)]" : "bg-[var(--card)]")
                  }
                >
                  <div>
                    <div className="text-sm font-semibold text-[var(--ink-900)]">{p.name}</div>
                    {target > 0 && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            "text-xs font-medium " +
                            (underTarget
                              ? "text-[var(--danger-700)]"
                              : overTarget
                                ? "text-[var(--warning-700)]"
                                : "text-[var(--ink-500)]")
                          }
                        >
                          {cellEntries.length}/{target}
                        </span>
                        {overTarget && <Badge tone="warning">Over target</Badge>}
                      </div>
                    )}
                  </div>

                  <div>
                    {cellEntries.length === 0 && target === 0 && (
                      <p className="text-xs text-[var(--ink-500)] mb-2">Nobody added yet.</p>
                    )}
                    {cellEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {cellEntries.map((r) => {
                          const roleCount = roleCountByEmployee.get(r.employeeId) ?? 1;
                          return (
                            <RosterPill
                              key={r.rosterEntryId}
                              entry={r}
                              roleCount={roleCount}
                              shiftId={shiftId}
                              readOnly={readOnly}
                              employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                              alreadyAssignedIds={new Set(cellEntries.map((e) => e.employeeId))}
                            />
                          );
                        })}
                      </div>
                    )}
                    {!readOnly && (
                      <RosterQuickAdd
                        shiftId={shiftId}
                        positionId={p.id}
                        positionName={p.name}
                        target={target}
                        currentCount={cellEntries.length}
                        employees={employeesByPosition.get(p.id) ?? { eligible: [], other: [] }}
                        alreadyAssignedIds={new Set(cellEntries.map((r) => r.employeeId))}
                        roster={roster}
                        allEmployees={allEmployees}
                        positions={positions}
                        weekShiftCounts={weekShiftCounts}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>

    {outToday.length > 0 && (
      <div className="mt-3">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase mb-1.5">Out today</h3>
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--card)]">
          {outToday.map((m) => (
            <OutTodayRow key={m.employeeId} mark={m} shiftId={shiftId} readOnly={readOnly} />
          ))}
        </div>
      </div>
    )}
    </>
  );
}

const MARK_LABELS: Record<RosterAttendanceMark["mark"], string> = {
  no_show: "No show",
  late: "Late",
  emergency: "Emergency",
};

function OutTodayRow({ mark, shiftId, readOnly }: { mark: RosterAttendanceMark; shiftId: number; readOnly: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-[var(--ink-900)]">
        {mark.employeeName}
        <Badge tone={mark.mark === "emergency" ? "neutral" : "danger"}>{MARK_LABELS[mark.mark]}</Badge>
        {mark.note && <span className="text-xs text-[var(--ink-500)]">“{mark.note}”</span>}
      </span>
      {!readOnly && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const fd = new FormData();
              fd.set("shiftId", String(shiftId));
              fd.set("employeeId", String(mark.employeeId));
              await clearAttendanceMark(fd);
              router.refresh();
            })
          }
          className="text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline min-h-11 px-2"
        >
          {isPending ? "Undoing…" : "Undo"}
        </button>
      )}
    </div>
  );
}

/** Teal = covering someone else's slot, same categorical color the
 * planner uses for reassigned (manager-forced change). Word, never
 * color alone. */
function SubstituteBadge({ covers }: { covers: string | null }) {
  return (
    <span
      title={covers ? `Substituting for ${covers}` : "Substitute"}
      className="whitespace-nowrap text-[10px] leading-tight px-1 py-0.5 rounded-[var(--radius-sm)] bg-teal-100 text-teal-700 border border-teal-300"
    >
      sub{covers ? ` for ${covers}` : ""}
    </span>
  );
}

function RosterPill({
  entry,
  roleCount,
  shiftId,
  readOnly,
  employees,
  alreadyAssignedIds,
}: {
  entry: RosterPageEntry;
  roleCount: number;
  shiftId: number;
  readOnly: boolean;
  employees: EmployeeOptionGroups;
  alreadyAssignedIds: Set<number>;
}) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  const badges = (
    <>
      {/* Swapped-in marker (Oliver, 2026-08-25): this slot isn't the
          person's original schedule — a coworker gave it up via a swap.
          Word + tooltip naming who, never color alone. */}
      {entry.swappedFromName && (
        <span title={`Covering for ${entry.swappedFromName} via a staff shift swap`}>
          <Badge tone="success">swapped</Badge>
        </span>
      )}
      {entry.coverageKind === "extra" && (
        <span title={entry.coverageNote ? `Extra — ${entry.coverageNote}` : "Added as an extra for today"}>
          <Badge tone="warning">extra</Badge>
        </span>
      )}
      {entry.coverageKind === "substitute" && <SubstituteBadge covers={entry.coversEmployeeName} />}
      {entry.attendanceMark === "late" && <Badge tone="warning">late</Badge>}
      {roleCount > 1 && <Badge tone="primary">{roleCount} roles</Badge>}
    </>
  );

  if (readOnly) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs bg-[var(--paper)] text-[var(--ink-700)] border border-[var(--border)] max-w-full">
        <span>{entry.employeeName}</span>
        {badges}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-x-1 rounded-[var(--radius-md)] px-1.5 text-xs bg-[var(--paper)] text-[var(--ink-700)] border border-[var(--border)] max-w-full">
      {/* The chip IS the control (2026-08-25, Oliver: "click at his box")
          -- opens the day-of attendance popup. Honest 44px row height
          (no negative-margin tricks -- they bled outside the border once
          badges wrap on a phone), and the contents flex-wrap so badges
          drop a line whole instead of clipping at the card edge (locked
          chip convention, caught on Oliver's iPhone screenshot). */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex-1 flex flex-wrap items-center gap-1.5 min-h-11 py-1 pl-1 hover:text-[var(--ink-900)] min-w-0 text-left"
        title={`${entry.employeeName} — late / substitute / absent`}
      >
        <span>{entry.employeeName}</span>
        {badges}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const formData = new FormData();
            formData.set("rosterEntryId", String(entry.rosterEntryId));
            formData.set("shiftId", String(shiftId));
            // No error surface in this pill; a failed remove leaves the
            // row standing, which is itself the signal. (Before the
            // 2026-08-24 sweep a failure here was an unhandled throw.)
            await removeRosterEntry(formData);
            router.refresh();
          })
        }
        // 44px hit box, glyph stays small -- the 20x20 version was under
        // WCAG 2.5.8's 24px floor (2026-08-24 button-size audit); same
        // fix the week view's remove got. This X means "added by
        // mistake" -- it records nothing; absences go through the chip.
        className="text-[var(--ink-400)] hover:text-[var(--danger)] disabled:opacity-50 min-w-11 min-h-11 -mr-1.5 flex items-center justify-center"
        title="Remove (added by mistake — records nothing)"
      >
        <XIcon width={12} height={12} />
      </button>

      {dialogOpen && (
        <PersonActionDialog
          entry={entry}
          shiftId={shiftId}
          employees={employees}
          alreadyAssignedIds={alreadyAssignedIds}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

/** The day-of attendance popup (2026-08-25, Oliver's scenario). One
 * dialog, steps chained -- never two popups at once:
 *   menu -> [Mark late] done
 *        -> [Replace with substitute] -> reason (No show / Emergency) -> pick sub -> commit
 *        -> [Absent — remove] -> reason -> commit
 * Replace commits three effects in ONE server batch: absent person off
 * the roster, their reason recorded, substitute in their position. */
function PersonActionDialog({
  entry,
  shiftId,
  employees,
  alreadyAssignedIds,
  onClose,
}: {
  entry: RosterPageEntry;
  shiftId: number;
  employees: EmployeeOptionGroups;
  alreadyAssignedIds: Set<number>;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<"menu" | "reason" | "sub">("menu");
  const [action, setAction] = useState<"replace" | "remove">("remove");
  const [reason, setReason] = useState<"no_show" | "emergency" | null>(null);
  const [note, setNote] = useState("");
  const [subId, setSubId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const isLate = entry.attendanceMark === "late";

  function run(fn: () => Promise<{ error?: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  function toggleLate() {
    run(async () => {
      const fd = new FormData();
      fd.set("shiftId", String(shiftId));
      fd.set("employeeId", String(entry.employeeId));
      if (isLate) return clearAttendanceMark(fd);
      fd.set("mark", "late");
      return setAttendanceMark(fd);
    });
  }

  function commit() {
    if (!reason) return;
    run(async () => {
      const fd = new FormData();
      fd.set("shiftId", String(shiftId));
      fd.set("rosterEntryId", String(entry.rosterEntryId));
      fd.set("mark", reason);
      fd.set("note", note);
      if (action === "replace") {
        fd.set("substituteEmployeeId", String(subId));
        return replaceWithSubstitute(fd);
      }
      return removeRosterEntryAbsent(fd);
    });
  }

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));

  const menuButton =
    "w-full text-left text-sm px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--paper)] text-[var(--ink-900)]";

  return (
    <Modal open onClose={onClose} labelledBy={titleId} initialFocus={closeRef}>
      <div id={titleId} className="text-base font-bold text-[var(--ink-900)] mb-1.5">
        {entry.employeeName} — {entry.positionName}
      </div>

      {error && (
        <div className="mb-3">
          <Banner tone="danger" title="That didn't save" description={error} />
        </div>
      )}

      {step === "menu" && (
        <div className="space-y-2">
          <button type="button" className={menuButton} onClick={toggleLate} disabled={isPending}>
            {isLate ? "Remove the late mark" : "Mark late"}
            <span className="block text-xs text-[var(--ink-500)]">
              {isLate ? "Marked late by mistake." : "Came to work, arrived late. Stays on the roster."}
            </span>
          </button>
          <button
            type="button"
            className={menuButton}
            onClick={() => {
              setAction("replace");
              setStep("reason");
            }}
            disabled={isPending}
          >
            Replace with a substitute
            <span className="block text-xs text-[var(--ink-500)]">Someone else takes this {entry.positionName} slot; why {entry.employeeName} is out gets recorded.</span>
          </button>
          <button
            type="button"
            className={menuButton}
            onClick={() => {
              setAction("remove");
              setStep("reason");
            }}
            disabled={isPending}
          >
            Absent — remove from this shift
            <span className="block text-xs text-[var(--ink-500)]">No replacement; why they&apos;re out gets recorded.</span>
          </button>
          <div className="flex justify-end pt-1">
            <Button ref={closeRef} variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === "reason" && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-700)]">Why is {entry.employeeName} out?</p>
          {(
            [
              { value: "no_show" as const, label: "No show", hint: "Didn't come, didn't tell anyone." },
              { value: "emergency" as const, label: "Emergency", hint: "Injury or an urgent event — excused." },
            ]
          ).map((r) => (
            <button
              key={r.value}
              type="button"
              className={
                menuButton +
                (reason === r.value ? " border-[var(--primary)] bg-[var(--primary-tint)]" : "")
              }
              onClick={() => setReason(r.value)}
              disabled={isPending}
            >
              {r.label}
              <span className="block text-xs text-[var(--ink-500)]">{r.hint}</span>
            </button>
          ))}
          <label className="block text-xs text-[var(--ink-500)]">
            Note (optional)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === "replace" ? "e.g. A came to help" : "e.g. called at 11am"}
              className="mt-1 w-full text-sm border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-2 py-1.5 bg-[var(--card)] text-[var(--ink-900)]"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setStep("menu")} disabled={isPending}>
              Back
            </Button>
            {action === "replace" ? (
              <Button variant="primary" size="sm" onClick={() => setStep("sub")} disabled={!reason || isPending}>
                Next: pick the substitute
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={commit} disabled={!reason} loading={isPending}>
                Remove & record
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "sub" && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-700)]">Who takes the {entry.positionName} slot?</p>
          <select
            value={subId}
            disabled={isPending}
            onChange={(e) => setSubId(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full text-sm border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-2 py-2 bg-[var(--card)] text-[var(--ink-900)]"
          >
            <option value="">Pick someone…</option>
            {eligible.length > 0 && (
              <optgroup label="Usually this role">
                {eligible.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label="Other">
                {other.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setStep("reason")} disabled={isPending}>
              Back
            </Button>
            <Button variant="primary" size="sm" onClick={commit} disabled={subId === ""} loading={isPending}>
              Replace & record
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RosterQuickAdd({
  shiftId,
  positionId,
  positionName,
  target,
  currentCount,
  employees,
  alreadyAssignedIds,
  roster,
  allEmployees,
  positions,
  weekShiftCounts,
}: {
  shiftId: number;
  positionId: number;
  positionName: string;
  target: number;
  currentCount: number;
  employees: EmployeeOptionGroups;
  alreadyAssignedIds: Set<number>;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  positions: { id: number; name: string; category: "FOH" | "BOH" }[];
  weekShiftCounts: Record<number, number>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const pickerTitleId = useId();
  // Two-or-three confirmations share one dialog slot: adding a second
  // role to the same person (the original guard), off-position, and
  // pushing past target (Oliver, 2026-08-24: warn with cancel | add
  // anyway, never block). When several apply, one dialog says all --
  // sequential popups for one tap would be worse than either warning.
  // Over-target now also ASKS "is this an extra?" and records the answer
  // (2026-08-25, Oliver) -- asExtra on the pending confirm wires the
  // coverage flag through performAdd.
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; description: string; confirmLabel: string; asExtra: boolean } | null>(null);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  function performAdd(employeeId: number, asExtra: boolean, note: string) {
    const formData = new FormData();
    formData.set("shiftId", String(shiftId));
    formData.set("employeeId", String(employeeId));
    formData.set("positionId", String(positionId));
    if (asExtra) {
      formData.set("coverageKind", "extra");
      formData.set("coverageNote", note);
    }
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted to
      // "Minified React error #441" in production (2026-08-24 sweep).
      const result = await addRosterEntry(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSelectedId("");
        setExtraNote("");
        router.refresh();
      }
    });
  }

  function handlePick(employeeId: number) {
    setPickerOpen(false);
    setSelectedId(employeeId);
    const employeeName = allEmployees.find((e) => e.id === employeeId)?.name ?? "This person";
    const existingPositions = roster.filter((r) => r.employeeId === employeeId).map((r) => r.positionName);
    const overTarget = target > 0 && currentCount >= target;
    // "Other" group = not one of this person's capable positions
    // (Oliver, 2026-08-24: same warn-don't-block dialog as over-target).
    const offPosition = employees.other.some((e) => e.id === employeeId);

    const sentences: string[] = [];
    if (existingPositions.length > 0) {
      sentences.push(
        `${employeeName} is already rostered as ${existingPositions.join(", ")} this shift — they'll be paid for all roles combined into one paycheck.`
      );
    }
    if (offPosition) {
      sentences.push(`${positionName} isn't one of ${employeeName}'s usual positions.`);
    }
    if (overTarget) {
      sentences.push(
        `${positionName} is already at ${currentCount}/${target} — is ${employeeName} an extra for today? Adding them records it as extra coverage.`
      );
    }

    if (sentences.length === 0) {
      performAdd(employeeId, false, "");
      return;
    }
    setPendingConfirm({
      title:
        existingPositions.length > 0 ? "Add a second role?" : overTarget ? `Is ${employeeName} an extra?` : "Not their usual position",
      description: sentences.join(" ") + (overTarget ? "" : " Just checking it's on purpose."),
      confirmLabel: overTarget ? "Yes, add as extra" : existingPositions.length > 0 ? "Add role" : "Add anyway",
      asExtra: overTarget,
    });
  }

  // Others grouped by the person's own department (their primary
  // position's category) -- Oliver, 2026-08-25: "list of people
  // categorize as compatible person then each department." Within every
  // group: fewest planned shifts this week first (the locked
  // candidate-picker fairness convention), then name.
  const categoryByPositionId = new Map(positions.map((p) => [p.id, p.category]));
  const load = (id: number) => weekShiftCounts[id] ?? 0;
  const byLoad = (a: { id: number; name: string }, b: { id: number; name: string }) =>
    load(a.id) - load(b.id) || a.name.localeCompare(b.name);
  const pickerGroups = [
    { header: `Usually ${positionName}`, people: [...eligible].sort(byLoad) },
    { header: "FOH — Front of house", people: other.filter((e) => categoryOf(e.id) === "FOH").sort(byLoad) },
    { header: "BOH — Back of house", people: other.filter((e) => categoryOf(e.id) === "BOH").sort(byLoad) },
    { header: "No usual position", people: other.filter((e) => categoryOf(e.id) === null).sort(byLoad) },
  ].filter((g) => g.people.length > 0);
  function categoryOf(employeeId: number): "FOH" | "BOH" | null {
    const primary = allEmployees.find((e) => e.id === employeeId)?.primaryPositionId;
    return primary != null ? (categoryByPositionId.get(primary) ?? null) : null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Button + popup picker instead of a native select (2026-08-25,
          Oliver) -- a select can't show per-person load or 44px rows.
          Picking one person closes the picker; the existing warning
          gates (second role / off-position / over-target-extra) chain
          after, one dialog at a time. Removal stays on the person's
          chip, deliberately -- adding and removing in one popup invites
          wrong-direction taps. */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          setPickerOpen(true);
        }}
        className="flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 text-xs font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--paper)] disabled:opacity-50"
      >
        {isPending ? "Adding…" : "+ Add"}
      </button>
      {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} labelledBy={pickerTitleId}>
        <div id={pickerTitleId} className="text-base font-bold text-[var(--ink-900)] mb-2">
          Add to {positionName}
        </div>
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
          {pickerGroups.map((g) => (
            <div key={g.header}>
              <div className="px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">{g.header}</div>
              <div className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)] mb-2">
                {g.people.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => handlePick(e.id)}
                    className="flex w-full min-h-11 items-center justify-between gap-2 px-3 text-sm text-[var(--ink-900)] bg-[var(--card)] hover:bg-[var(--paper)] text-left"
                  >
                    <span>{e.name}</span>
                    <span className="text-xs text-[var(--ink-500)]">
                      {load(e.id)} {load(e.id) === 1 ? "shift" : "shifts"} this week
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={() => setPickerOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          const asExtra = pendingConfirm?.asExtra ?? false;
          setPendingConfirm(null);
          if (selectedId !== "") performAdd(selectedId, asExtra, extraNote);
        }}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
        body={
          pendingConfirm?.asExtra ? (
            <label className="block text-xs text-[var(--ink-500)]">
              Reason (optional)
              <input
                type="text"
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                placeholder="e.g. came to help on a busy night"
                className="mt-1 w-full text-sm border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-2 py-1.5 bg-[var(--card)] text-[var(--ink-900)]"
              />
            </label>
          ) : undefined
        }
      />
    </div>
  );
}
