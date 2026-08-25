"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRosterEntry, removeRosterEntry } from "@/lib/actions/shift";
import type { RosterPageEntry } from "@/lib/shift/loadRosterPageData";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { XIcon } from "@/components/ui/icons";

/** Position-grid redesign of the roster page (2026-08-11, Oliver: wanted
 * it to read like the Schedule Planner's weekly grid — headcount target
 * per position, plus an inline dropdown to add someone as a last-minute
 * change right before the closing report). One position per row (this
 * page is always for one specific date+period, so there's no day-column
 * axis like the weekly grid has); each row shows who's assigned, the
 * target count, and a quick-add control.
 *
 * Restyled 2026-08-16 as stacked position cards rather than a table at any
 * width — this content (a position name + a wrapped list of pills) reads
 * better as sections than as a cramped two-column table, and it means
 * there's no separate mobile/desktop layout to keep in sync.
 *
 * The multi-role guard now uses the shared <ConfirmDialog> instead of a
 * raw window.confirm() — that was one of the 5 real gaps caught in the
 * 2026-08-16 verification pass (an unstyled OS popup breaking out of the
 * app's UI entirely). Same wording, same guard, just styled. */
export function RosterGrid({
  shiftId,
  positions,
  roster,
  targets,
  allEmployees,
  employeeAssignedPositionIds,
  readOnly,
}: {
  shiftId: number;
  positions: { id: number; name: string; category: "FOH" | "BOH" }[];
  roster: RosterPageEntry[];
  targets: Record<number, number>;
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
  employeeAssignedPositionIds: Record<number, number[]>;
  readOnly: boolean;
}) {
  const roleCountByEmployee = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of roster) map.set(r.employeeId, (map.get(r.employeeId) ?? 0) + 1);
    return map;
  }, [roster]);

  const employeesByPosition = useMemo(() => {
    const map = new Map<number, { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] }>();
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
  // calendar/grid conventions. The per-row "(FOH)" suffix is gone --
  // the section row it sits under already says it. The 2026-08-16
  // stacked-cards note above predates that language; superseded.
  return (
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
                          return <RosterPill key={r.rosterEntryId} entry={r} roleCount={roleCount} shiftId={shiftId} readOnly={readOnly} />;
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
  );
}

function RosterPill({
  entry,
  roleCount,
  shiftId,
  readOnly,
}: {
  entry: RosterPageEntry;
  roleCount: number;
  shiftId: number;
  readOnly: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1.5 rounded-[var(--radius-full)] pl-2.5 pr-1.5 py-1 text-xs bg-[var(--paper)] text-[var(--ink-700)] border border-[var(--border)]">
      <span>{entry.employeeName}</span>
      {/* Swapped-in marker (Oliver, 2026-08-25): this slot isn't the
          person's original schedule — a coworker gave it up via a swap.
          Word + tooltip naming who, never color alone. */}
      {entry.swappedFromName && (
        <span title={`Covering for ${entry.swappedFromName} via a staff shift swap`}>
          <Badge tone="success">swapped</Badge>
        </span>
      )}
      {roleCount > 1 && (
        <Badge tone="primary">{roleCount} roles</Badge>
      )}
      {!readOnly && (
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
          // fix the week view's remove got.
          className="text-[var(--ink-400)] hover:text-[var(--danger)] disabled:opacity-50 min-w-11 min-h-11 -my-3 -mr-2 flex items-center justify-center"
          title="Remove"
        >
          <XIcon width={12} height={12} />
        </button>
      )}
    </div>
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
}: {
  shiftId: number;
  positionId: number;
  positionName: string;
  target: number;
  currentCount: number;
  employees: { eligible: { id: number; name: string }[]; other: { id: number; name: string }[] };
  alreadyAssignedIds: Set<number>;
  roster: RosterPageEntry[];
  allEmployees: { id: number; name: string; primaryPositionId: number | null }[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  // Two confirmations share one dialog slot: adding a second role to the
  // same person (the original guard) and pushing a position past its
  // target (Oliver, 2026-08-24: warn with cancel | add anyway, never
  // block). When both apply, one dialog says both -- two sequential
  // popups for one tap would be worse than either warning.
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; description: string; confirmLabel: string } | null>(null);

  const eligible = employees.eligible.filter((e) => !alreadyAssignedIds.has(e.id));
  const other = employees.other.filter((e) => !alreadyAssignedIds.has(e.id));
  if (eligible.length === 0 && other.length === 0) return null;

  function performAdd() {
    if (selectedId === "") return;
    const formData = new FormData();
    formData.set("shiftId", String(shiftId));
    formData.set("employeeId", String(selectedId));
    formData.set("positionId", String(positionId));
    setError(null);
    startTransition(async () => {
      // Return-value error -- thrown server-action errors get redacted to
      // "Minified React error #441" in production (2026-08-24 sweep).
      const result = await addRosterEntry(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSelectedId("");
        router.refresh();
      }
    });
  }

  function handleAddClick() {
    if (selectedId === "") return;
    const employeeName = allEmployees.find((e) => e.id === selectedId)?.name ?? "This person";
    const existingPositions = roster.filter((r) => r.employeeId === selectedId).map((r) => r.positionName);
    const overTarget = target > 0 && currentCount >= target;
    // "Other" optgroup = not one of this person's capable positions
    // (Oliver, 2026-08-24: same warn-don't-block dialog as over-target).
    const offPosition = employees.other.some((e) => e.id === selectedId);

    // One dialog for however many of the three warnings apply -- two or
    // three sequential popups for a single tap would be worse than any of
    // the warnings.
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
        `${positionName} is already at ${currentCount}/${target} — adding one more makes it ${currentCount + 1}/${target}. Fine for a busy day.`
      );
    }

    if (sentences.length === 0) {
      performAdd();
      return;
    }
    setPendingConfirm({
      title:
        existingPositions.length > 0 ? "Add a second role?" : offPosition ? "Not their usual position" : "Already at target",
      description: sentences.join(" ") + " Just checking it's on purpose.",
      confirmLabel: existingPositions.length > 0 ? "Add role" : "Add anyway",
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selectedId}
        disabled={isPending}
        onChange={(e) => {
          setSelectedId(e.target.value === "" ? "" : Number(e.target.value));
          setError(null);
        }}
        className="text-xs border border-[var(--border-strong)] rounded-[var(--radius-sm)] px-2 py-1.5 max-w-[160px] text-[var(--ink-700)] disabled:opacity-50 bg-[var(--card)]"
      >
        <option value="">+ Add</option>
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
      {selectedId !== "" && (
        <Button type="button" size="sm" onClick={handleAddClick} loading={isPending}>
          {isPending ? "Adding…" : "Add"}
        </Button>
      )}
      {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          setPendingConfirm(null);
          performAdd();
        }}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
      />
    </div>
  );
}
