"use client";

import { useEffect, useState, useTransition } from "react";
import {
  syncEmployeePositionTemplate,
  retireEmployeeFromPosition,
  setTemplateVacancy,
  clearTemplateVacancy,
} from "@/lib/actions/schedule";
import type { AssignedEmployeeGroup, PositionTemplateGroup, TemplateCell } from "@/lib/schedule/loadTemplatesByPosition";

// Display order is Monday-first (matches the Weekly Plan grid and how
// Oliver reads a real restaurant schedule) — the underlying dayOfWeek
// values stay 0=Sun..6=Sat, JS Date.getDay() convention used everywhere
// else in this app. Only the DISPLAY order changes here.
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
const PERIODS = ["Lunch", "Dinner"] as const;

const VACANCY_LABELS: Record<string, string> = {
  RESIGNATION: "Resigning",
  PROMOTION: "Promoted/moved",
  OTHER: "Leaving this position",
};

function keyFor(dayOfWeek: number, period: string): string {
  return `${dayOfWeek}-${period}`;
}

/** Position -> an always-visible Mon-Sun x Lunch/Dinner checkbox grid,
 * one row-pair per assigned person (2026-08-14 redesign, Oliver's ask —
 * see PROGRESS.md and project_atlas_schedule_planner memory). Supersedes
 * the 2026-08-12 version, which showed each person's pattern as a text
 * summary ("Mon L, Tue D...") and only revealed an editable checkbox
 * grid after clicking into a separate per-person editor below the list.
 *
 * 2026-08-14, same day, follow-up: checkboxes start DISABLED and only
 * become checkable after clicking that row's "Edit" button (Oliver's
 * ask — a look-only default so browsing the grid can't accidentally
 * change someone's pattern; the click-to-unlock is per person, not
 * global, and stays unlocked until the page reloads). Mark
 * vacating/Retire, previously behind a dropdown off the same button,
 * now show as small inline links right under Edit/Done once a row is
 * unlocked, rather than a separate popup menu. */
export function PositionTemplateGrid({ groups }: { groups: PositionTemplateGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <PositionCard key={g.positionId} group={g} />
      ))}
    </div>
  );
}

function PositionCard({ group }: { group: PositionTemplateGroup }) {
  // A person picked from "+ Add" shows up here immediately as a blank
  // row (nothing checked yet) even though nothing's been saved to the DB
  // yet -- employeeScheduleTemplates only ever stores rows for days that
  // are actually checked, so there's no "empty" row to load until the
  // first checkbox is saved. Once that happens, the revalidated `group`
  // prop will include them for real, and the effect below drops them
  // from this pending set so they don't render twice.
  const [pendingNewIds, setPendingNewIds] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const assignedIds = new Set(group.assignedEmployees.map((e) => e.employeeId));
    setPendingNewIds((prev) => prev.filter((p) => !assignedIds.has(p.id)));
  }, [group.assignedEmployees]);

  const notYetAssigned = group.eligibleEmployees.filter(
    (e) => !group.assignedEmployees.some((a) => a.employeeId === e.id) && !pendingNewIds.some((p) => p.id === e.id)
  );

  const rows: AssignedEmployeeGroup[] = [
    ...group.assignedEmployees,
    ...pendingNewIds.map((p) => ({ employeeId: p.id, employeeName: p.name, cells: [], vacancyReason: null, vacancyStartsOn: null })),
  ].sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return (
    <div className="border rounded p-4">
      <h3 className="font-medium mb-3">
        {group.positionName} <span className="text-xs text-neutral-400">({group.positionCategory})</span>
      </h3>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400 mb-3">Nobody assigned yet.</p>
      ) : (
        <table className="text-sm border-collapse mb-3 w-full">
          <thead>
            <tr>
              <th className="text-left text-neutral-500 font-normal pb-1 pr-2">Name</th>
              <th className="w-6"></th>
              {DISPLAY_DAYS.map((d) => (
                <th key={d} className="text-neutral-500 font-normal pb-1 px-1 w-10">
                  {DAY_SHORT[d]}
                </th>
              ))}
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((emp) => (
              <EmployeeRowPair key={emp.employeeId} group={group} employee={emp} />
            ))}
          </tbody>
        </table>
      )}

      <PersonPicker
        eligibleEmployees={notYetAssigned}
        onPick={(emp) => setPendingNewIds((prev) => [...prev, emp])}
      />
    </div>
  );
}

/** Renders one employee's two rows (Lunch, Dinner) for a position's
 * grid. Name and the Edit action span both rows (rowSpan=2) so they
 * read as one visual block per person, matching Oliver's spec: "each
 * day has 2 rows... name on the left... the most right is edit
 * button." Checkboxes are disabled until this row's own Edit button is
 * clicked (`editing`, below) — a look-only default, unlocked per row. */
function EmployeeRowPair({ group, employee }: { group: PositionTemplateGroup; employee: AssignedEmployeeGroup }) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(employee.cells.map((c) => keyFor(c.dayOfWeek, c.period)))
  );
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Keep local checkbox state in sync if the underlying data changes for
  // reasons outside this row's own toggles (e.g. another manager's edit
  // landing via revalidation, or this same row's very first save turning
  // a "pending new" employee into a real one with real cells).
  useEffect(() => {
    setChecked(new Set(employee.cells.map((c) => keyFor(c.dayOfWeek, c.period))));
  }, [employee.cells]);

  function toggle(dayOfWeek: number, period: "Lunch" | "Dinner") {
    if (!editing) return; // belt-and-suspenders -- inputs are also `disabled` when locked
    const key = keyFor(dayOfWeek, period);
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);

    const cells = Array.from(next).map((k) => {
      const [d, p] = k.split("-");
      return { dayOfWeek: Number(d), period: p as "Lunch" | "Dinner" };
    });
    setError(null);
    startTransition(async () => {
      try {
        await syncEmployeePositionTemplate(employee.employeeId, group.positionId, cells);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that change.");
        setChecked(checked); // revert the optimistic toggle
      }
    });
  }

  const isVacant = employee.vacancyReason !== null;
  const rowBg = isVacant ? "bg-red-50" : "";
  const checkboxClass = "w-4 h-4" + (editing ? "" : " opacity-40 cursor-not-allowed");

  return (
    <>
      <tr className={rowBg}>
        <td rowSpan={2} className="align-top pr-2 py-1 border-t">
          <div className={"font-medium" + (isPending ? " opacity-50" : "")}>{employee.employeeName}</div>
          {isVacant && (
            <div className="text-[10px] text-red-700">
              {VACANCY_LABELS[employee.vacancyReason ?? ""] ?? employee.vacancyReason} · {employee.vacancyStartsOn}
            </div>
          )}
          {error && <div className="text-[10px] text-red-600 mt-0.5">{error}</div>}
        </td>
        <td className="text-[10px] text-neutral-400 border-t">L</td>
        {DISPLAY_DAYS.map((d) => (
          <td key={d} className="text-center px-1 py-0.5 border-t">
            <input
              type="checkbox"
              checked={checked.has(keyFor(d, "Lunch"))}
              onChange={() => toggle(d, "Lunch")}
              disabled={!editing}
              className={checkboxClass}
              aria-label={`${employee.employeeName} — ${DAY_SHORT[d]} Lunch`}
            />
          </td>
        ))}
        <td rowSpan={2} className="text-right align-top pl-2 py-1 border-t">
          <EmployeeEdit group={group} employee={employee} editing={editing} setEditing={setEditing} />
        </td>
      </tr>
      <tr className={rowBg}>
        <td className="text-[10px] text-neutral-400">D</td>
        {DISPLAY_DAYS.map((d) => (
          <td key={d} className="text-center px-1 py-0.5">
            <input
              type="checkbox"
              checked={checked.has(keyFor(d, "Dinner"))}
              onChange={() => toggle(d, "Dinner")}
              disabled={!editing}
              className={checkboxClass}
              aria-label={`${employee.employeeName} — ${DAY_SHORT[d]} Dinner`}
            />
          </td>
        ))}
      </tr>
    </>
  );
}

function PersonPicker({
  eligibleEmployees,
  onPick,
}: {
  eligibleEmployees: { id: number; name: string }[];
  onPick: (employee: { id: number; name: string }) => void;
}) {
  const [value, setValue] = useState<number | "">("");

  if (eligibleEmployees.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="">+ Add a person…</option>
        {eligibleEmployees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={value === ""}
        onClick={() => {
          const emp = eligibleEmployees.find((e) => e.id === value);
          if (emp) onPick(emp);
          setValue("");
        }}
        className="text-sm underline text-neutral-500 hover:text-black disabled:opacity-40 disabled:no-underline"
      >
        Add
      </button>
    </div>
  );
}

/** Edit/Done toggle for one row — unlocks that row's checkboxes
 * (`editing`, lifted from EmployeeRowPair) and, only while unlocked,
 * shows the Mark vacating / Clear vacancy / Retire actions as small
 * inline links underneath (2026-08-14 follow-up — previously a
 * dropdown menu behind a small "⋮" icon, independent of checkbox
 * edit-lock; now folded into the same unlock state so there's one
 * consistent "this row is in edit mode" signal instead of two separate
 * controls). */
function EmployeeEdit({
  group,
  employee,
  editing,
  setEditing,
}: {
  group: PositionTemplateGroup;
  employee: AssignedEmployeeGroup;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const [showVacancyForm, setShowVacancyForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isVacant = employee.vacancyReason !== null;
  const anyTemplateId = employee.cells[0]?.templateId;

  return (
    <div className="relative inline-block text-right">
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        className="text-xs text-neutral-500 hover:text-black border rounded px-2 py-1"
      >
        {editing ? "Done" : "Edit"}
      </button>
      {editing && (
        <div className="mt-1 flex flex-col items-end gap-1 text-[11px]">
          {isVacant ? (
            <button
              type="button"
              disabled={isPending || !anyTemplateId}
              onClick={() =>
                startTransition(async () => {
                  if (anyTemplateId) await clearTemplateVacancy(anyTemplateId);
                })
              }
              className="text-neutral-500 hover:text-black underline disabled:opacity-40 disabled:no-underline"
            >
              Clear vacancy
            </button>
          ) : (
            <button
              type="button"
              disabled={!anyTemplateId}
              onClick={() => setShowVacancyForm(true)}
              className="text-neutral-500 hover:text-black underline disabled:opacity-40 disabled:no-underline"
            >
              Mark vacating…
            </button>
          )}
          <button
            type="button"
            disabled={isPending || !anyTemplateId}
            onClick={() => {
              if (window.confirm(`Retire ${employee.employeeName} from ${group.positionName} entirely?`)) {
                startTransition(async () => {
                  await retireEmployeeFromPosition(employee.employeeId, group.positionId);
                });
              }
            }}
            className="text-red-700 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Retire
          </button>
        </div>
      )}
      {showVacancyForm && (
        <VacancyPopoverForm
          templateId={anyTemplateId}
          onDone={() => setShowVacancyForm(false)}
          onCancel={() => setShowVacancyForm(false)}
        />
      )}
    </div>
  );
}

function VacancyPopoverForm({
  templateId,
  onDone,
  onCancel,
}: {
  templateId: number | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<"RESIGNATION" | "PROMOTION" | "OTHER">("RESIGNATION");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));

  const scopeHint: Record<typeof reason, string> = {
    RESIGNATION: "Flags every shift this person has, in any position.",
    PROMOTION: "Flags every shift they have in THIS position (other positions stay as-is).",
    OTHER: "Same scope as Promoted — use this when the reason is something else, e.g. dropping this position by choice.",
  };

  return (
    <div className="absolute right-0 z-20 mt-1 w-72 bg-white border rounded shadow-lg p-3 text-sm text-left">
      <label className="block mb-2">
        <span className="block text-neutral-500 mb-1 text-xs">Reason</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="border rounded px-2 py-1 w-full">
          <option value="RESIGNATION">Resigning</option>
          <option value="PROMOTION">Promoted/moved to another position</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block mb-2">
        <span className="block text-neutral-500 mb-1 text-xs">Starts on</span>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="border rounded px-2 py-1 w-full" />
      </label>
      <p className="text-[11px] text-neutral-400 mb-2">{scopeHint[reason]}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || !templateId}
          onClick={() =>
            startTransition(async () => {
              if (templateId) await setTemplateVacancy(templateId, reason, startsOn);
              onDone();
            })
          }
          className="bg-red-700 text-white px-3 py-1 rounded text-xs hover:bg-red-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Set"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
