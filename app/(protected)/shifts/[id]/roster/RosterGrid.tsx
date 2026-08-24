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

  return (
    <div className="space-y-2">
      {positions.map((p, i) => {
        const prevCategory = i > 0 ? positions[i - 1].category : null;
        const showCategoryBreak = p.category !== prevCategory;
        const cellEntries = roster.filter((r) => r.positionId === p.id);
        const target = targets[p.id] ?? 0;
        const underTarget = target > 0 && cellEntries.length < target;
        // Over target warns, never blocks (Oliver, 2026-08-24) -- extra
        // coverage on a busy day is legitimate, it just should not pass
        // silently.
        const overTarget = target > 0 && cellEntries.length > target;

        return (
          <div key={p.id}>
            {/* Named FOH/BOH section headers instead of a bare divider line
                (Oliver, 2026-08-24: "so it easier for human eyes"). */}
            {showCategoryBreak && (
              <h3 className={"text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase mb-1.5" + (i > 0 ? " mt-4" : "")}>
                {p.category === "FOH" ? "FOH — Front of house" : "BOH — Back of house"}
              </h3>
            )}
            <div
              className={
                "border rounded-[var(--radius-lg)] p-3.5 " +
                (underTarget ? "border-[var(--danger-border)] bg-[var(--danger-tint)]" : "border-[var(--border)] bg-[var(--card)]")
              }
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-[var(--ink-900)]">
                  {p.name} <span className="text-xs font-normal text-[var(--ink-400)]">({p.category})</span>
                </div>
                {target > 0 && (
                  <span className="flex items-center gap-1.5">
                    {overTarget && <Badge tone="warning">Over target</Badge>}
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
                  </span>
                )}
              </div>

              {cellEntries.length === 0 && target === 0 && (
                <p className="text-xs text-[var(--ink-500)] mb-2">Nobody added yet.</p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-2">
                {cellEntries.map((r) => {
                  const roleCount = roleCountByEmployee.get(r.employeeId) ?? 1;
                  return <RosterPill key={r.rosterEntryId} entry={r} roleCount={roleCount} shiftId={shiftId} readOnly={readOnly} />;
                })}
              </div>

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
          className="text-[var(--ink-400)] hover:text-[var(--danger)] disabled:opacity-50 w-5 h-5 flex items-center justify-center"
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
    const existingPositions = roster.filter((r) => r.employeeId === selectedId).map((r) => r.positionName);
    const overTarget = target > 0 && currentCount >= target;
    const overSentence = `${positionName} is already at ${currentCount}/${target} — adding one more makes it ${currentCount + 1}/${target}. Fine for a busy day, just checking it's on purpose.`;

    if (existingPositions.length > 0) {
      const employeeName = allEmployees.find((e) => e.id === selectedId)?.name ?? "This person";
      setPendingConfirm({
        title: "Add a second role?",
        description:
          `${employeeName} is already rostered as ${existingPositions.join(", ")} this shift. Add another role too? They'll be paid for all roles combined into one paycheck.` +
          (overTarget ? ` Also: ${overSentence}` : ""),
        confirmLabel: "Add role",
      });
      return;
    }
    if (overTarget) {
      setPendingConfirm({
        title: "Already at target",
        description: overSentence,
        confirmLabel: "Add anyway",
      });
      return;
    }
    performAdd();
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
